/** The hero CTA here is the canonical "make #1 match #2" target. */
export function Home() {
  return (
    <section className="hero">
      <h1>Ship faster</h1>
      <p>The hero call-to-action below is styled boldly — a good reference element.</p>
      <button data-testid="hero-cta" className="btn btn-primary btn-lg">
        Start free trial
      </button>
    </section>
  );
}
