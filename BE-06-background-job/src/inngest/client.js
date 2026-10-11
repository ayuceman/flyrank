const { Inngest } = require('inngest');

// One client for the whole app. The id is what the Dev Server shows.
const inngest = new Inngest({ id: 'report-api' });

module.exports = { inngest };
