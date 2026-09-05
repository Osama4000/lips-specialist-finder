const { runScrape } = require('./lipsScraper');
runScrape().then(({ metadata }) => {
  console.log(JSON.stringify(metadata, null, 2));
}).catch(err => {
  console.error(err);
  process.exitCode = 1;
});
