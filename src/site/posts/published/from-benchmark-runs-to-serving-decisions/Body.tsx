function DataFlow() {
  const box = (y: number, title: string, detail: string, accent = false) => (
    <g key={title}>
      <rect x="30" y={y} width="440" height="76" rx="12" fill={accent ? 'var(--accent-wash)' : 'var(--raise)'} stroke={accent ? 'var(--accent)' : 'var(--line)'} strokeWidth="1.5" />
      <text x="250" y={y + 30} textAnchor="middle" fill="var(--ink)" fontSize="21" fontWeight="600">{title}</text>
      <text x="250" y={y + 56} textAnchor="middle" fill="var(--ink-2)" fontSize="18">{detail}</text>
    </g>
  );
  return (
    <figure style={{ maxWidth: 520, margin: '2rem auto' }}>
      <svg viewBox="0 0 500 578" role="img" aria-labelledby="import-flow-title import-flow-description" style={{ width: '100%', height: 'auto' }}>
        <title id="import-flow-title">From raw benchmarks to a serving economics graph</title>
        <desc id="import-flow-description">Legacy JSON and QuettaBench run files pass through separate adapters, then common validation. Sanitized, versioned snapshots are installed into Serving Lab. Prices and utilization are applied at the graph, leaving measurements unchanged.</desc>
        <defs><marker id="import-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-3)" /></marker></defs>
        {box(10, 'Raw measurements', 'Legacy JSON · QuettaBench files')}
        {box(112, 'Format-specific adapters', 'Pinned input hashes · raw formats')}
        {box(214, 'Validated observations', 'Units · workload · billing · source', true)}
        {box(316, 'Versioned snapshots', 'Immutable · verified · reversible')}
        {box(418, 'Serving Lab graph', 'Measurements + chosen assumptions')}
        {[86, 188, 290, 392].map(y => <path key={y} d={`M250 ${y} V${y + 23}`} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" markerEnd="url(#import-arrow)" />)}
        <path d="M250 549 V501" fill="none" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#import-arrow)" />
        <text x="250" y="570" textAnchor="middle" fill="var(--ink-2)" fontSize="18">Costs · prices · utilization · copies</text>
      </svg>
      <figcaption style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>Measurements and commercial assumptions meet at the graph.</figcaption>
    </figure>
  );
}

export default function Body() {
  return <>
    <p>A benchmark directory can tell you how fast a server ran. A capacity decision needs more: what workload ran, how many GPUs were allocated, which requests failed, and what the resulting tokens would cost to serve. Moving a throughput number between dashboards can lose that context.</p>
    <p>We built an importer connecting our benchmark archive to Serving Lab, our serving economics tool. It reads both older benchmark JSON files and current QuettaBench runs, then produces a common, versioned observation format. The first release contains nine measured operating points across three separate studies.</p>
    <DataFlow />

    <h2>Start with the run, not the chart</h2>
    <p>Older runs store configuration, summary metrics and request records in one JSON file. Current QuettaBench runs separate these into <code>run.json</code> and <code>requests.jsonl</code>. Each adapter reads its own format and checks the input hashes against a reviewed study manifest.</p>
    <p>The importer reconciles request counts, token totals and the measurement window before producing a point. It preserves the model, GPU allocation, parallel layout, precision, context limit and available revision information. An unknown value stays unknown. A repeated import produces the same snapshot; distinct repeats keep their own identities.</p>

    <h2>The same label can hide different arithmetic</h2>
    <p>Serving Lab records throughput for the complete setup. A website export reporting 1,904 output tokens per second per GPU on two GPUs represents roughly 3,808 tokens per second for that setup. Neither number comes from multiplying concurrency by a speed percentile.</p>
    <p>Latency statistics need equal care. The reciprocal of an interpolated latency percentile is not necessarily the same as a percentile of reciprocal latencies. We calculate each eligible request’s decode speed from its accepted output and decode duration, then take speed percentiles. We also retain the reciprocal-TPOT figures so the definitions can be inspected.</p>
    <pre><code>{'request speed = 1,000 × (output tokens − 1)\n                ÷ (end-to-end ms − first-token ms)'}</code></pre>
    <p>Requests with only one output token or no positive decode interval do not provide that speed measurement. Their exclusion from the speed sample remains visible.</p>

    <h2>Revenue needs measured billing inputs</h2>
    <p>A long conversation can reuse context without the server reporting how many cached tokens it billed. The importer keeps those two facts separate. Estimated context reuse cannot fill in missing cached-input usage.</p>
    <p>Our four older RTX GLM pilot runs therefore show performance and cost, but no potential profit. The four imported B200 GLM campaign runs report cached-token usage for every successful request, allowing conditional revenue calculations from their own measured token mix. The legacy RTX 3090 point remains unpriced because Serving Lab has no matching hardware-cost input.</p>
    <p>Prices, utilization and the number of setup copies remain editable assumptions. Utilization affects delivered volume once; hardware costs include idle time. Adding copies scales fleet output and cost together. None of these controls changes the stored measurements, and retail API prices do not establish provider payouts or customer demand.</p>

    <h2>Publish a snapshot you can reproduce</h2>
    <p>The publisher writes sanitized aggregates to a separate prefix in our existing object store. Original run archives and the public QuettaBench website’s exports remain in place. Releases are identified by content hashes; the catalog pointer changes only after the release files have been verified. A concurrent publication cannot silently overwrite that pointer.</p>
    <p>Serving Lab installs an explicitly selected, verified snapshot. Its browser reads that local aggregate and receives neither storage credentials nor raw request files. An incomplete or corrupt release leaves the installed snapshot intact, and an earlier release can be selected for rollback.</p>
    <p>The imported studies appear as separate workloads on the existing graph, with inline inspection and export. The RTX and B200 studies use different configurations and request shapes, so they are not presented as a controlled hardware comparison or fed into automatic recommendations. The next useful step is broader coverage under the same explicit measurement rules.</p>
  </>;
}
