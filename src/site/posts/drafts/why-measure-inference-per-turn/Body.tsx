import { TurnTraceChart } from '../../../components/TurnTraceChart';

export default function Body() {
  return (
    <>
      <p>Agentic workloads are conversations with a serving system. A request produces tokens, a tool runs, and the next request arrives with a longer context. The cache and the queue both carry history from one turn to the next.</p>
      <h2>More context does not always mean more prefill</h2>
      <p>In the SWE-bench trajectory shown below, the context grows from 1,310 to 32,101 tokens. By the final sampled turn, 97% is already in the prefix cache. Measured time to first token rises from 173 to 227 milliseconds: about 1.3×, while the context grows about 25×.</p>
      <TurnTraceChart />
      <p>This is one trajectory, not a promise about every workload. It shows why context length alone does not describe the work a server actually performs.</p>
      <h2>Measure the request in its history</h2>
      <p>QuettaBench replays multi-turn workloads at fixed concurrency and records latency for each turn. That lets us study time to first token, time per output token, and end-to-end latency alongside the changing context.</p>
      <p>The useful question is how the serving system behaves across the workload you intend to run. We use those measurements to evaluate the simulator and guide the inference engine.</p>
    </>
  );
}
