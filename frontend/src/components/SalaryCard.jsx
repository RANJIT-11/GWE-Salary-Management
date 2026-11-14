export default function SalaryCard({ title, amount }) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-sm text-slate-500">{title}</h2>
      <p className="mt-2 text-2xl font-semibold">{amount}</p>
    </section>
  );
}
