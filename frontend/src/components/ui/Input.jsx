export default function Input({ label, id, error, as = "input", className = "", ...props }) {
  const Component = as;
  const controlClassName = [
    "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm",
    "placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100",
    error ? "border-red-300 focus:border-red-500 focus:ring-red-100" : "border-slate-300",
    className,
  ]
    .join(" ")
    .trim();

  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={id} className="text-sm font-semibold text-slate-800">
          {label}
        </label>
      ) : null}
      <Component id={id} className={controlClassName} {...props} />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
