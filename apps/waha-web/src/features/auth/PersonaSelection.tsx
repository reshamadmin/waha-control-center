import { useNavigate } from "react-router-dom";
import { useAuthStore, Persona } from "../../store/authStore.js";

export const PersonaSelection = () => {
  const { user, setPersona } = useAuthStore();
  const navigate = useNavigate();

  const handleSelect = (persona: Persona) => {
    setPersona(persona);
    if (persona === "CRM") {
      navigate("/crm/inbox");
    } else if (persona === "ADMIN") {
      navigate("/settings/profile");
    } else {
      alert(`${persona} persona dashboard is coming soon in Phase 2!`);
    }
  };

  const personasList = [
    {
      id: "CRM" as const,
      title: "CRM Workspace",
      desc: "Manage incoming leads, customer conversations, and safe message broadcasts.",
      active: true,
      color: "border-accent bg-accent/5 text-accent"
    },
    {
      id: "SERVICE" as const,
      title: "Service Desk",
      desc: "Ticket assignments, customer support escalations, and service workflows.",
      active: false,
      color: "border-line bg-slate-50 text-muted opacity-60"
    },
    {
      id: "ADMIN" as const,
      title: "Administration Panel",
      desc: "Configure WAHA connections, Gemini prompt templates, safe delays, and audit logs.",
      active: true,
      color: "border-brand bg-brand/5 text-brand"
    },
    {
      id: "CXO" as const,
      title: "CXO Dashboard",
      desc: "Review high-level metrics, campaign performance, conversion analytics, and charts.",
      active: false,
      color: "border-line bg-slate-50 text-muted opacity-60"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="max-w-4xl w-full text-center mb-8">
        <h1 className="text-3xl font-bold text-ink mb-2">Hello, {user?.name || "Operator"}</h1>
        <p className="text-muted text-base">Select your operating mode workspace to proceed</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl w-full">
        {personasList.map((p) => (
          <div
            key={p.id}
            onClick={() => handleSelect(p.id)}
            className={`border rounded-2xl p-6 transition-all cursor-pointer relative hover:-translate-y-1 hover:shadow-md ${
              p.active ? "border-line hover:border-slate-400 bg-white" : "bg-slate-100/50 border-slate-200 cursor-not-allowed"
            }`}
          >
            {!p.active && (
              <span className="absolute top-4 right-4 bg-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                🔒 Phase 2
              </span>
            )}
            <div className="flex items-center gap-3 mb-3">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm border ${p.color}`}>
                {p.id}
              </span>
              <h2 className="text-lg font-bold text-ink">{p.title}</h2>
            </div>
            <p className="text-muted text-sm leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
