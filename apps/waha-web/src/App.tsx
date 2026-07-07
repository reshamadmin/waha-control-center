import { useUiStore } from "./store/uiStore";

export default function App() {
  const { currentPersona } = useUiStore ? useUiStore() : { currentPersona: "CRM" };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-ink p-6">
      <div className="bg-white border border-line rounded-2xl p-8 max-w-md w-full shadow-lg text-center">
        <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center font-bold text-2xl mx-auto mb-4">
          WA
        </div>
        <h1 className="text-2xl font-bold mb-2">WAHA Control Center</h1>
        <p className="text-muted text-sm mb-6">
          Standalone WhatsApp Workspace V1 has been initialized.
        </p>
        <div className="bg-slate-50 border border-line rounded-xl p-4 text-left mb-6">
          <div className="text-xs text-muted uppercase tracking-wider font-semibold mb-1">
            Current Status
          </div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="w-2.5 h-2.5 bg-success rounded-full animate-pulse"></span>
            Sprint 1 Workspace Initialized
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-xs text-muted">Persona Mode:</span>
            <span className="font-semibold text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
              {currentPersona}
            </span>
          </div>
        </div>
        <div className="text-xs text-muted">
          Resham Sutra DigitalOcean Infrastructure
        </div>
      </div>
    </div>
  );
}
