import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { lookupDispatcherEmail } = await import("../lib/detention/replyScan.ts");

for (const name of ["Nikola Sukilovic", "Nikola", "Nick Sukilovic", "Nick"]) {
  const email = await lookupDispatcherEmail(name);
  console.log(JSON.stringify({ name, email }));
}
process.exit(0);
