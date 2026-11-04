import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence for the render tree.
 *
 * The sequencer and the Spotify client already report recoverable errors
 * through the store; this boundary exists for programming errors (a bad
 * selector, a malformed track payload) so the user never stares at a blank
 * window. It intentionally keeps the dark shell so the failure still looks
 * like Harmonic Playlist.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[harmonic-playlist] render crash', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-bg flex h-full w-full items-center justify-center p-6">
        <div className="glass grain w-full max-w-md rounded-2xl p-6">
          <p className="label-xs text-rose-300">Beklenmeyen hata</p>
          <h1 className="display mt-2 text-xl text-white">Arayüz çöktü</h1>
          <p className="mt-2 text-[11.5px] leading-relaxed text-fog-300">
            Set üretimi ve çalma durumu korunuyor. Aşağıdaki hatayı kapatıp devam
            edebilir ya da uygulamayı yenileyebilirsin.
          </p>
          <pre className="scroll-slim mt-4 max-h-32 overflow-auto rounded-lg border border-white/[0.07] bg-black/30 p-3 text-[10px] leading-relaxed text-rose-200">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              onClick={this.reset}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-fog-100 transition hover:bg-white/[0.08]"
            >
              Tekrar dene
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-neon-mint px-3 py-2 text-[11px] font-semibold text-ink-950 transition hover:brightness-110"
            >
              Uygulamayı yenile
            </button>
          </div>
        </div>
      </div>
    );
  }
}

interface SectionProps {
  children: ReactNode;
  /** Shown instead of the children when they throw. */
  label?: string;
}

interface SectionState {
  error: Error | null;
}

/**
 * Boundary for one panel, not the whole app.
 *
 * A malformed Spotify payload used to take down the entire window because the
 * only boundary sat at the root. Data-driven widgets (playlist lists, imported
 * crates) belong behind their own boundary so the rest of the set builder — and
 * the user's unsaved plan — survives a single bad response.
 */
export class SectionBoundary extends Component<SectionProps, SectionState> {
  state: SectionState = { error: null };

  static getDerivedStateFromError(error: Error): SectionState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[harmonic-playlist] section crash', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300">
          {this.props.label ?? 'Bu bölüm yüklenemedi'}
        </p>
        <p className="mt-1 break-words text-[10px] leading-relaxed text-fog-300">
          {this.state.error.message}
        </p>
        <button
          onClick={this.reset}
          className="mt-2 text-[10px] font-medium text-neon-mint underline underline-offset-2"
        >
          Tekrar dene →
        </button>
      </div>
    );
  }
}
