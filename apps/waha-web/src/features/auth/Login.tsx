import { useForm } from "react-hook-form";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore.js";

export const Login = () => {
  const { login, error: authError } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const onSubmit = async (data: any) => {
    setLoading(true);
    const success = await login(data.email, data.password);
    setLoading(false);
    if (success) {
      navigate("/select-persona");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white border border-line rounded-2xl p-8 max-w-md w-full shadow-lg">
        <div className="w-12 h-12 bg-brand/10 text-brand rounded-xl flex items-center justify-center font-bold text-xl mb-4">
          WA
        </div>
        <h1 className="text-2xl font-bold text-ink mb-1">Welcome back</h1>
        <p className="text-muted text-sm mb-6">Sign in to your Resham Sutra WhatsApp Control Center</p>

        {authError && (
          <div className="bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl p-3 mb-4 font-medium animate-shake">
            ⚠️ {authError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              {...register("email", {
                required: "Email is required.",
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: "Enter a valid email address."
                }
              })}
              className={`w-full px-3 py-2 border rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all ${
                errors.email ? "border-danger focus:border-danger" : "border-line focus:border-accent"
              }`}
              placeholder="name@reshamsutra.com"
            />
            {errors.email && (
              <span className="text-danger text-xs mt-1 block font-medium">
                {errors.email.message}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              {...register("password", {
                required: "Password is required.",
                minLength: {
                  value: 6,
                  message: "Password must be at least 6 characters."
                }
              })}
              className={`w-full px-3 py-2 border rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all ${
                errors.password ? "border-danger focus:border-danger" : "border-line focus:border-accent"
              }`}
              placeholder="••••••••"
            />
            {errors.password && (
              <span className="text-danger text-xs mt-1 block font-medium">
                {errors.password.message}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-accent hover:bg-accent/90 text-white font-medium rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
