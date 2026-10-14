// How long each server read of a screen takes, measured where it really happens (GRAMA's
// app/_lib/perf.ts). On with PERF_LOG=1: locally `PERF_LOG=1 pnpm start`, on Vercel the project
// variable, whose function logs are the only place with production's real times. Off, it costs
// one comparison. pnpm perf (scripts/perf/screens.mts) measures the other half: what a person
// waits for and how many bytes travel.

const ON = process.env.PERF_LOG === '1';

/** Wraps a read and logs what it took. Returns exactly what the read returns. */
export async function measure<T>(screen: string, name: string, work: Promise<T>): Promise<T> {
    if (!ON) return work;
    const from = performance.now();
    const result = await work;
    console.log(`[perf] ${screen} · ${name.padEnd(26)} ${Math.round(performance.now() - from)} ms`);
    return result;
}
