// Prints its arguments as JSON, or fails the way it is told to. Used by the tests of
// runTool (scripts/deploy/shared.mts) to see exactly what a tool receives.
const args = process.argv.slice(2);
if (args[0] === '--error-line') console.log('error: too many arguments');
if (args[0] === '--exit-1') process.exit(1);
console.log(JSON.stringify(args));
