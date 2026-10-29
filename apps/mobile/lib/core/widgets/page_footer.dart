import 'package:flutter/material.dart';

import '../../data/api/cursor_page.dart';
import '../theme/sentra_theme.dart';

/// Footer for paged lists: spinner while loading, retry on error, nothing at the end.
class PageFooter extends StatelessWidget {
  const PageFooter({super.key, required this.state, required this.onRetry});
  final PagedState<Object?> state;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    if (state.loading) {
      return const Padding(
        padding: EdgeInsets.all(AppSpace.s4),
        child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
      );
    }
    if (state.error != null) {
      return Center(
        child: TextButton(key: const Key('pageRetry'), onPressed: onRetry, child: const Text('Coba lagi')),
      );
    }
    return const SizedBox(key: Key('pageEnd'), height: AppSpace.s6);
  }
}
