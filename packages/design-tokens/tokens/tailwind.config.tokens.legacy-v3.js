/** LEGACY (Tailwind v3) — MVP memakai Tailwind v4 (tailwind.theme.css). Butuh tokens.css di-import. */
module.exports = {
  "darkMode": [
    "selector",
    "[data-theme=\"dark\"]"
  ],
  "theme": {
    "extend": {
      "colors": {
        "bg": {
          "canvas": "var(--color-bg-canvas)",
          "surface": "var(--color-bg-surface)",
          "raised": "var(--color-bg-raised)",
          "overlay": "var(--color-bg-overlay)",
          "sunken": "var(--color-bg-sunken)",
          "inset": "var(--color-bg-inset)"
        },
        "border": {
          "subtle": "var(--color-border-subtle)",
          "default": "var(--color-border-default)",
          "strong": "var(--color-border-strong)",
          "focus": "var(--color-border-focus)"
        },
        "text": {
          "primary": "var(--color-text-primary)",
          "secondary": "var(--color-text-secondary)",
          "tertiary": "var(--color-text-tertiary)",
          "disabled": "var(--color-text-disabled)",
          "onAccent": "var(--color-text-onAccent)"
        },
        "brand": {
          "primary": "var(--color-brand-primary)",
          "primaryHover": "var(--color-brand-primaryHover)",
          "primaryPressed": "var(--color-brand-primaryPressed)",
          "primaryContainer": "var(--color-brand-primaryContainer)",
          "onPrimaryContainer": "var(--color-brand-onPrimaryContainer)"
        },
        "semantic": {
          "profit": "var(--color-semantic-profit)",
          "profitContainer": "var(--color-semantic-profitContainer)",
          "loss": "var(--color-semantic-loss)",
          "lossContainer": "var(--color-semantic-lossContainer)",
          "warning": "var(--color-semantic-warning)",
          "warningContainer": "var(--color-semantic-warningContainer)",
          "guard": "var(--color-semantic-guard)",
          "guardContainer": "var(--color-semantic-guardContainer)",
          "info": "var(--color-semantic-info)",
          "infoContainer": "var(--color-semantic-infoContainer)",
          "neutralPnl": "var(--color-semantic-neutralPnl)"
        },
        "mode": {
          "practice": "var(--color-mode-practice)",
          "practiceContainer": "var(--color-mode-practiceContainer)",
          "onPractice": "var(--color-mode-onPractice)",
          "real": "var(--color-mode-real)",
          "realContainer": "var(--color-mode-realContainer)",
          "onReal": "var(--color-mode-onReal)"
        },
        "inverse": {
          "surface": "var(--color-inverse-surface)",
          "onSurface": "var(--color-inverse-onSurface)",
          "primary": "var(--color-inverse-primary)"
        },
        "scrim": {
          "overlay": "var(--color-scrim-overlay)"
        },
        "skeleton": {
          "base": "var(--color-skeleton-base)",
          "highlight": "var(--color-skeleton-highlight)"
        }
      },
      "fontFamily": {
        "sans": [
          "var(--font-sans)"
        ],
        "mono": [
          "var(--font-mono)"
        ]
      },
      "fontSize": {
        "display": [
          "var(--text-display)",
          {
            "lineHeight": "var(--text-display--line-height)",
            "fontWeight": "var(--text-display--font-weight)"
          }
        ],
        "headline": [
          "var(--text-headline)",
          {
            "lineHeight": "var(--text-headline--line-height)",
            "fontWeight": "var(--text-headline--font-weight)"
          }
        ],
        "title": [
          "var(--text-title)",
          {
            "lineHeight": "var(--text-title--line-height)",
            "fontWeight": "var(--text-title--font-weight)"
          }
        ],
        "titleSm": [
          "var(--text-titleSm)",
          {
            "lineHeight": "var(--text-titleSm--line-height)",
            "fontWeight": "var(--text-titleSm--font-weight)"
          }
        ],
        "body": [
          "var(--text-body)",
          {
            "lineHeight": "var(--text-body--line-height)",
            "fontWeight": "var(--text-body--font-weight)"
          }
        ],
        "bodyLg": [
          "var(--text-bodyLg)",
          {
            "lineHeight": "var(--text-bodyLg--line-height)",
            "fontWeight": "var(--text-bodyLg--font-weight)"
          }
        ],
        "label": [
          "var(--text-label)",
          {
            "lineHeight": "var(--text-label--line-height)",
            "fontWeight": "var(--text-label--font-weight)"
          }
        ],
        "caption": [
          "var(--text-caption)",
          {
            "lineHeight": "var(--text-caption--line-height)",
            "fontWeight": "var(--text-caption--font-weight)"
          }
        ],
        "overline": [
          "var(--text-overline)",
          {
            "lineHeight": "var(--text-overline--line-height)",
            "fontWeight": "var(--text-overline--font-weight)"
          }
        ],
        "numLg": [
          "var(--text-numLg)",
          {
            "lineHeight": "var(--text-numLg--line-height)",
            "fontWeight": "var(--text-numLg--font-weight)"
          }
        ],
        "numMd": [
          "var(--text-numMd)",
          {
            "lineHeight": "var(--text-numMd--line-height)",
            "fontWeight": "var(--text-numMd--font-weight)"
          }
        ],
        "numSm": [
          "var(--text-numSm)",
          {
            "lineHeight": "var(--text-numSm--line-height)",
            "fontWeight": "var(--text-numSm--font-weight)"
          }
        ],
        "eyebrow": [
          "var(--text-eyebrow)",
          {
            "lineHeight": "var(--text-eyebrow--line-height)",
            "fontWeight": "var(--text-eyebrow--font-weight)"
          }
        ]
      },
      "borderRadius": {
        "xs": "4px",
        "sm": "6px",
        "md": "10px",
        "lg": "14px",
        "xl": "20px",
        "full": "9999px"
      },
      "boxShadow": {
        "e0": "none",
        "e1": "0 1px 2px 0px rgba(0,0,0,0.3)",
        "e2": "0 2px 6px 0px rgba(0,0,0,0.32)",
        "e3": "0 8px 20px 0px rgba(0,0,0,0.36)",
        "e4": "0 16px 40px 0px rgba(0,0,0,0.44)"
      }
    }
  }
};
