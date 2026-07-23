import React, { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../../utils/constants';

interface Props {
  children: ReactNode;
  zone: string; // identifier for logging
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

/**
 * Per-zone error boundary for the reader screen.
 *
 * Each zone (text, top bar, etc.) has its own error boundary
 * so a crash in one zone doesn't bring down the entire reader.
 *
 * After 2 crashes in 5 seconds, shows a recovery UI
 * instead of retrying endlessly.
 */
export class ReaderErrorBoundary extends Component<Props, State> {
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.zone}]`, error.message);
    console.error('[ErrorBoundary] Component stack:', info.componentStack?.slice(0, 300));

    this.setState((prev) => ({
      errorCount: prev.errorCount + 1,
    }));

    // Auto-reset after a moment (unless we've hit the limit)
    if (this.state.errorCount < 2) {
      this.resetTimer = setTimeout(() => {
        this.setState({ hasError: false, error: null });
      }, 2000);
    }
  }

  componentWillUnmount() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorCount: 0 });
  };

  render() {
    if (this.state.hasError) {
      // After too many errors, show a recovery UI
      if (this.state.errorCount >= 3 && this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠</Text>
          <Text style={styles.message}>
            {this.state.errorCount >= 3
              ? '此区域遇到多次错误'
              : '显示异常'}
          </Text>
          <Text style={styles.detail} numberOfLines={2}>
            {this.state.error?.message || '未知错误'}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={this.handleReset}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>
              {this.state.errorCount >= 3 ? '重新加载' : '重试'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.bg,
  },
  icon: {
    fontSize: 32,
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  detail: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: Colors.accent,
  },
  retryText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
});
