/** The pricing CTA is intentionally plain — capture it as #1 to restyle. */
export function Pricing() {
  return (
    <section className="pricing">
      <h2>Pricing</h2>
      <div className="card">
        <h3>Pro plan</h3>
        <p>Everything you need to go to production.</p>
        <button data-testid="pricing-cta" className="btn btn-secondary">
          Get started
        </button>
      </div>
    </section>
  );
}
