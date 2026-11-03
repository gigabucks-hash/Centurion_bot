//! Coin-logo transcoder (Centurion Trade logo proxy, docs/LOGO_PROXY.md).
//!
//! Input: untrusted bytes fetched from token metadata. Output: freshly encoded WebP (lossless) and PNG at
//! 48/64/96/128/192 px (contracts 1.1.6 size enum), square, letterboxed on transparency. Only pixels survive: EXIF/XMP/ICC/text chunks,
//! animation frames after the first, and any trailing data are never copied. SVG and every format other than
//! PNG/JPEG/GIF/WebP are rejected by magic bytes (the declared Content-Type is ignored).
//!
//! Decompression-bomb guard: dimensions are read from the header and checked against MAX_SIDE / MAX_PIXELS
//! before any pixel buffer is allocated, and each decoder also gets its own memory limit.

use std::io::Cursor;

/// Max encoded input (bytes). The API enforces the same cap while streaming the download.
pub const MAX_INPUT: usize = 2 * 1024 * 1024;
/// Max decoded width or height.
pub const MAX_SIDE: u32 = 4096;
/// Max decoded pixels (width * height): 16.7 M px = 64 MiB RGBA.
pub const MAX_PIXELS: u64 = 4096 * 4096;
/// Decoder working-memory cap (bytes) beyond the output buffer.
const DECODER_MEM: usize = 96 * 1024 * 1024;
/// Output sizes (px): contracts 1.1.6 / UX COIN_LOGO §2 (`s=48|64|96|128|192`, lead decision 2026-11-03).
pub const SIZES: [u32; 5] = [48, 64, 96, 128, 192];
/// Output byte budget: target (UX "≤ 8 KB") and hard cap (UX client cap 16 KB; above it the logo is rejected).
pub const TARGET_BYTES: usize = 8 * 1024;
pub const HARD_MAX_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Png,
    Jpeg,
    Gif,
    Webp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LogoError {
    Empty,
    TooLargeInput,
    SvgRejected,
    Unsupported,
    TooLargeDimensions {
        width: u64,
        height: u64,
    },
    /** Re-encoded output still above HARD_MAX_BYTES after the strongest posterization. */
    OutputTooLarge,
    Decode(String),
}

impl LogoError {
    /// Stable short code (logged by the API, stored in the negative cache).
    pub fn code(&self) -> &'static str {
        match self {
            LogoError::Empty => "empty",
            LogoError::TooLargeInput => "too_large_input",
            LogoError::SvgRejected => "svg_rejected",
            LogoError::Unsupported => "unsupported_format",
            LogoError::TooLargeDimensions { .. } => "too_large_dimensions",
            LogoError::OutputTooLarge => "output_too_large",
            LogoError::Decode(_) => "decode_failed",
        }
    }
    pub fn is_rejection(&self) -> bool {
        !matches!(self, LogoError::Decode(_))
    }
}

/// Classify by magic bytes only.
pub fn sniff(b: &[u8]) -> Result<Format, LogoError> {
    if b.is_empty() {
        return Err(LogoError::Empty);
    }
    if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok(Format::Png);
    }
    if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Ok(Format::Jpeg);
    }
    if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        return Ok(Format::Gif);
    }
    if b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        return Ok(Format::Webp);
    }
    if looks_like_svg(b) {
        return Err(LogoError::SvgRejected);
    }
    Err(LogoError::Unsupported)
}

fn looks_like_svg(b: &[u8]) -> bool {
    let head = &b[..b.len().min(4096)];
    let s = String::from_utf8_lossy(head).to_ascii_lowercase();
    s.contains("<svg") || (s.trim_start().starts_with("<?xml") && s.contains("svg"))
}

fn check_dims(w: u64, h: u64) -> Result<(), LogoError> {
    if w == 0 || h == 0 {
        return Err(LogoError::Decode("zero dimension".into()));
    }
    if w > MAX_SIDE as u64 || h > MAX_SIDE as u64 || w.saturating_mul(h) > MAX_PIXELS {
        return Err(LogoError::TooLargeDimensions {
            width: w,
            height: h,
        });
    }
    Ok(())
}

/// Decoded straight-alpha RGBA8.
pub struct Rgba {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

fn derr<E: std::fmt::Display>(e: E) -> LogoError {
    LogoError::Decode(e.to_string().chars().take(120).collect())
}

pub fn decode(b: &[u8]) -> Result<Rgba, LogoError> {
    if b.len() > MAX_INPUT {
        return Err(LogoError::TooLargeInput);
    }
    match sniff(b)? {
        Format::Png => decode_png(b),
        Format::Jpeg => decode_jpeg(b),
        Format::Gif => decode_gif(b),
        Format::Webp => decode_webp(b),
    }
}

fn decode_png(b: &[u8]) -> Result<Rgba, LogoError> {
    let mut dec = png::Decoder::new_with_limits(Cursor::new(b), png::Limits { bytes: DECODER_MEM });
    dec.set_transformations(png::Transformations::normalize_to_color8());
    // ignore_text_chunk etc.: text/EXIF chunks are never copied anyway; skip CRC-free ancillary parsing cost
    dec.set_ignore_text_chunk(true);
    let mut r = dec.read_info().map_err(derr)?;
    let (w, h) = {
        let i = r.info();
        (i.width, i.height)
    };
    check_dims(w as u64, h as u64)?;
    let size = r
        .output_buffer_size()
        .ok_or_else(|| LogoError::Decode("png buffer size".into()))?;
    let mut buf = vec![0u8; size];
    // first frame only (APNG: the default image)
    let info = r.next_frame(&mut buf).map_err(derr)?;
    buf.truncate(info.buffer_size());
    let px = (w as usize) * (h as usize);
    let data = match info.color_type {
        png::ColorType::Rgba => buf,
        png::ColorType::Rgb => {
            let mut o = Vec::with_capacity(px * 4);
            for c in buf.chunks_exact(3) {
                o.extend_from_slice(&[c[0], c[1], c[2], 255]);
            }
            o
        }
        png::ColorType::Grayscale => {
            let mut o = Vec::with_capacity(px * 4);
            for &g in &buf {
                o.extend_from_slice(&[g, g, g, 255]);
            }
            o
        }
        png::ColorType::GrayscaleAlpha => {
            let mut o = Vec::with_capacity(px * 4);
            for c in buf.chunks_exact(2) {
                o.extend_from_slice(&[c[0], c[0], c[0], c[1]]);
            }
            o
        }
        png::ColorType::Indexed => {
            return Err(LogoError::Decode("indexed png not expanded".into()))
        }
    };
    if data.len() != px * 4 {
        return Err(LogoError::Decode("png size mismatch".into()));
    }
    Ok(Rgba {
        width: w,
        height: h,
        data,
    })
}

fn decode_jpeg(b: &[u8]) -> Result<Rgba, LogoError> {
    use zune_jpeg::zune_core::colorspace::ColorSpace;
    use zune_jpeg::zune_core::options::DecoderOptions;
    let opts = DecoderOptions::default()
        .set_max_width(MAX_SIDE as usize)
        .set_max_height(MAX_SIDE as usize)
        .jpeg_set_out_colorspace(ColorSpace::RGBA);
    let mut dec = zune_jpeg::JpegDecoder::new_with_options(Cursor::new(b), opts);
    dec.decode_headers().map_err(|e| {
        let s = format!("{e:?}");
        if s.contains("Width")
            || s.contains("Height")
            || s.contains("width")
            || s.contains("height")
        {
            LogoError::TooLargeDimensions {
                width: 0,
                height: 0,
            }
        } else {
            derr(s)
        }
    })?;
    let (w, h) = dec
        .dimensions()
        .ok_or_else(|| LogoError::Decode("jpeg dimensions".into()))?;
    check_dims(w as u64, h as u64)?;
    let data = dec.decode().map_err(|e| derr(format!("{e:?}")))?;
    if data.len() != w * h * 4 {
        return Err(LogoError::Decode("jpeg size mismatch".into()));
    }
    Ok(Rgba {
        width: w as u32,
        height: h as u32,
        data,
    })
}

fn decode_gif(b: &[u8]) -> Result<Rgba, LogoError> {
    let mut o = gif::DecodeOptions::new();
    o.set_color_output(gif::ColorOutput::RGBA);
    o.set_memory_limit(gif::MemoryLimit::Bytes(
        std::num::NonZeroU64::new(DECODER_MEM as u64).expect("nonzero"),
    ));
    let mut dec = o.read_info(Cursor::new(b)).map_err(derr)?;
    let (sw, sh) = (dec.width() as u32, dec.height() as u32);
    check_dims(sw as u64, sh as u64)?;
    // first frame only, composited onto a transparent logical screen
    let frame = dec
        .read_next_frame()
        .map_err(derr)?
        .ok_or_else(|| LogoError::Decode("gif has no frames".into()))?;
    let (fl, ft, fw, fh) = (
        frame.left as u32,
        frame.top as u32,
        frame.width as u32,
        frame.height as u32,
    );
    check_dims(fw as u64, fh as u64)?;
    let mut canvas = vec![0u8; (sw as usize) * (sh as usize) * 4];
    let src = &frame.buffer;
    for y in 0..fh {
        let cy = ft + y;
        if cy >= sh {
            break;
        }
        for x in 0..fw {
            let cx = fl + x;
            if cx >= sw {
                break;
            }
            let si = ((y * fw + x) * 4) as usize;
            let di = ((cy * sw + cx) * 4) as usize;
            if si + 4 <= src.len() {
                canvas[di..di + 4].copy_from_slice(&src[si..si + 4]);
            }
        }
    }
    Ok(Rgba {
        width: sw,
        height: sh,
        data: canvas,
    })
}

fn decode_webp(b: &[u8]) -> Result<Rgba, LogoError> {
    let mut dec = image_webp::WebPDecoder::new(Cursor::new(b)).map_err(derr)?;
    dec.set_memory_limit(DECODER_MEM);
    let (w, h) = dec.dimensions();
    check_dims(w as u64, h as u64)?;
    let size = dec
        .output_buffer_size()
        .ok_or_else(|| LogoError::Decode("webp buffer size".into()))?;
    let mut buf = vec![0u8; size];
    // animated: read_image returns the first frame
    dec.read_image(&mut buf).map_err(derr)?;
    let px = (w as usize) * (h as usize);
    let data = if dec.has_alpha() {
        buf
    } else {
        let mut o = Vec::with_capacity(px * 4);
        for c in buf.chunks_exact(3) {
            o.extend_from_slice(&[c[0], c[1], c[2], 255]);
        }
        o
    };
    if data.len() != px * 4 {
        return Err(LogoError::Decode("webp size mismatch".into()));
    }
    Ok(Rgba {
        width: w,
        height: h,
        data,
    })
}

/// 1-D area-average weights: for each destination index, (first source index, weights).
fn weights(src: usize, dst: usize) -> Vec<(usize, Vec<f32>)> {
    let scale = src as f64 / dst as f64;
    (0..dst)
        .map(|i| {
            let start = i as f64 * scale;
            let end = ((i + 1) as f64 * scale).min(src as f64);
            let j0 = start.floor() as usize;
            let j1 = (end.ceil() as usize).max(j0 + 1).min(src);
            let mut ws: Vec<f32> = (j0..j1)
                .map(|j| ((end.min(j as f64 + 1.0) - start.max(j as f64)).max(0.0)) as f32)
                .collect();
            let sum: f32 = ws.iter().sum();
            if sum > 0.0 {
                ws.iter_mut().for_each(|w| *w /= sum);
            } else {
                ws = vec![1.0];
            }
            (j0, ws)
        })
        .collect()
}

/// Square `n`x`n` straight-alpha RGBA: the image is scaled to fit (aspect kept), centered on transparency.
/// Area-average resampling in premultiplied alpha (no colour halos on transparent edges).
pub fn resize_square(img: &Rgba, n: u32) -> Vec<u8> {
    let (w, h) = (img.width as usize, img.height as usize);
    let n_us = n as usize;
    let side = w.max(h) as f64;
    let dw = ((w as f64 * n as f64 / side).round() as usize).clamp(1, n_us);
    let dh = ((h as f64 * n as f64 / side).round() as usize).clamp(1, n_us);
    let wx = weights(w, dw);
    let wy = weights(h, dh);
    // horizontal pass: w x h -> dw x h (premultiplied f32)
    let mut tmp = vec![0f32; dw * h * 4];
    for y in 0..h {
        let row = &img.data[y * w * 4..(y + 1) * w * 4];
        for (x, (j0, ws)) in wx.iter().enumerate() {
            let mut acc = [0f32; 4];
            for (k, &wgt) in ws.iter().enumerate() {
                let p = &row[(j0 + k) * 4..(j0 + k) * 4 + 4];
                let a = p[3] as f32 / 255.0;
                acc[0] += p[0] as f32 * a * wgt;
                acc[1] += p[1] as f32 * a * wgt;
                acc[2] += p[2] as f32 * a * wgt;
                acc[3] += p[3] as f32 * wgt;
            }
            tmp[(y * dw + x) * 4..(y * dw + x) * 4 + 4].copy_from_slice(&acc);
        }
    }
    // vertical pass into the centered square canvas
    let mut out = vec![0u8; n_us * n_us * 4];
    let ox = (n_us - dw) / 2;
    let oy = (n_us - dh) / 2;
    for (y, (j0, ws)) in wy.iter().enumerate() {
        for x in 0..dw {
            let mut acc = [0f32; 4];
            for (k, &wgt) in ws.iter().enumerate() {
                let i = ((j0 + k) * dw + x) * 4;
                for c in 0..4 {
                    acc[c] += tmp[i + c] * wgt;
                }
            }
            let a = acc[3];
            let o = ((oy + y) * n_us + ox + x) * 4;
            if a <= 0.0 {
                continue;
            }
            let inv = 255.0 / a;
            out[o] = (acc[0] * inv).round().clamp(0.0, 255.0) as u8;
            out[o + 1] = (acc[1] * inv).round().clamp(0.0, 255.0) as u8;
            out[o + 2] = (acc[2] * inv).round().clamp(0.0, 255.0) as u8;
            out[o + 3] = a.round().clamp(0.0, 255.0) as u8;
        }
    }
    out
}

pub fn encode_png(rgba: &[u8], n: u32) -> Result<Vec<u8>, LogoError> {
    let mut v = Vec::new();
    {
        // only IHDR/IDAT/IEND are written: no text, time, gamma, ICC or EXIF chunks
        let mut e = png::Encoder::new(&mut v, n, n);
        e.set_color(png::ColorType::Rgba);
        e.set_depth(png::BitDepth::Eight);
        e.set_compression(png::Compression::High);
        let mut w = e.write_header().map_err(derr)?;
        w.write_image_data(rgba).map_err(derr)?;
        w.finish().map_err(derr)?;
    }
    Ok(v)
}

pub fn encode_webp(rgba: &[u8], n: u32) -> Result<Vec<u8>, LogoError> {
    let mut v = Vec::new();
    image_webp::WebPEncoder::new(&mut v)
        .encode(rgba, n, n, image_webp::ColorType::Rgba8)
        .map_err(derr)?;
    Ok(v)
}

/// Reduce each channel to `bits` (bit replication keeps 0 and 255 exact, so full transparency/opacity survive).
fn posterize(rgba: &[u8], bits: u32) -> Vec<u8> {
    if bits >= 8 {
        return rgba.to_vec();
    }
    let sh = 8 - bits;
    rgba.iter()
        .map(|&v| {
            let q = ((v as u32 + (1 << (sh - 1))) >> sh).min((1 << bits) - 1);
            let mut o = q << sh;
            let mut k = bits;
            while k < 8 {
                o |= q << sh >> k; // replicate high bits into the low bits
                k += bits;
            }
            o.min(255) as u8
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutFormat {
    Webp,
    Png,
}

impl OutFormat {
    pub fn ext(self) -> &'static str {
        match self {
            OutFormat::Webp => "webp",
            OutFormat::Png => "png",
        }
    }
    fn encode(self, rgba: &[u8], n: u32) -> Result<Vec<u8>, LogoError> {
        match self {
            OutFormat::Webp => encode_webp(rgba, n),
            OutFormat::Png => encode_png(rgba, n),
        }
    }
}

/// Lossless encode within the byte budget: plain first, then posterized 7..3 bits per channel until the output
/// is <= TARGET_BYTES; otherwise the smallest attempt if <= HARD_MAX_BYTES, else OutputTooLarge.
/// Returns (bytes, bits used).
pub fn encode_budget(fmt: OutFormat, rgba: &[u8], n: u32) -> Result<(Vec<u8>, u32), LogoError> {
    let mut best: Option<(Vec<u8>, u32)> = None;
    for bits in [8u32, 7, 6, 5, 4, 3] {
        let px = posterize(rgba, bits);
        let b = fmt.encode(&px, n)?;
        if b.len() <= TARGET_BYTES {
            return Ok((b, bits));
        }
        if best.as_ref().is_none_or(|(x, _)| b.len() < x.len()) {
            best = Some((b, bits));
        }
    }
    match best {
        Some((b, bits)) if b.len() <= HARD_MAX_BYTES => Ok((b, bits)),
        _ => Err(LogoError::OutputTooLarge),
    }
}

/// WebP flavour of [`encode_budget`].
pub fn encode_webp_budget(rgba: &[u8], n: u32) -> Result<(Vec<u8>, u32), LogoError> {
    encode_budget(OutFormat::Webp, rgba, n)
}

pub struct Output {
    pub size: u32,
    pub format: OutFormat,
    pub bytes: Vec<u8>,
    /// Bits per channel kept (8 = exact).
    pub bits: u32,
}

impl Output {
    pub fn file_name(&self) -> String {
        format!("{}.{}", self.size, self.format.ext())
    }
}

/// Decode once, emit every size as WebP and PNG (lossless, budgeted). A size/format whose output stays above
/// HARD_MAX_BYTES even posterized is omitted (the API then serves the next smaller size of that format); the
/// logo as a whole is rejected only when the smallest WebP (48 px) cannot be produced.
pub fn transcode_all(input: &[u8]) -> Result<Vec<Output>, LogoError> {
    let img = decode(input)?;
    let mut out = Vec::with_capacity(SIZES.len() * 2);
    for fmt in [OutFormat::Webp, OutFormat::Png] {
        for n in SIZES {
            let px = resize_square(&img, n);
            match encode_budget(fmt, &px, n) {
                Ok((bytes, bits)) => out.push(Output {
                    size: n,
                    format: fmt,
                    bytes,
                    bits,
                }),
                Err(LogoError::OutputTooLarge) => break, // larger sizes only get bigger
                Err(e) => return Err(e),
            }
        }
    }
    if !out
        .iter()
        .any(|o| o.format == OutFormat::Webp && o.size == SIZES[0])
    {
        return Err(LogoError::OutputTooLarge);
    }
    Ok(out)
}
