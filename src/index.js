const core = require('@actions/core');
const config = require('./config');
const aws = require('./aws');
const gh = require('./gh');

function setOutput(labels, instanceId, runnerName) {
  core.setOutput('labels', labels);
  core.setOutput('ec2-instance-id', instanceId);
  core.setOutput('runner-name', runnerName);
}

async function start() {
  const unique = config.generateUniqueLabel();
  let labels = config.input.labels;
  if (labels) {
    labels += ',';
  }
  labels += unique;

  const regToken = await gh.getRegistrationToken();
  const instanceId = await aws.startEc2Instance(labels, regToken);
  await aws.waitForInstanceRunning(instanceId);
  const runnerName = await gh.waitForRunnerRegistered(unique);
  setOutput(labels, instanceId, runnerName);
}

async function stop() {
  await aws.terminateEc2Instance();
  await gh.removeRunner();
}

(async function () {
  try {
    config.input.mode === 'start' ? await start() : await stop();
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();
