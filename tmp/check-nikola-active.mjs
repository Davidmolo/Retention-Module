import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { lookupDispatcherSend } = await import("../lib/detention/replyScan.ts");
for (const name of ["Nikola Sukilovic", "Nikola Vrh", "Nick Davidoff"]) {
  console.log(name, JSON.stringify(await lookupDispatcherSend(name)));
}
process.exit(0);
