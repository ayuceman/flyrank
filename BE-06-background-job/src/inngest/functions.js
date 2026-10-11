const { inngest } = require('./client');

// Stage 1: the introductions. Trigger it from the Dev Server dashboard (Invoke).
// Note: inngest v4 puts triggers inside the options object, not as a second argument.
const sayHello = inngest.createFunction(
  { id: 'say-hello', triggers: [{ event: 'test/hello' }] },
  async ({ step }) => {
    await step.sleep('wait-a-moment', '5s');
    return 'Hello from the background!';
  }
);

module.exports = { functions: [sayHello] };
