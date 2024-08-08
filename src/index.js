const core = require('@actions/core');
const config = require('./config');
const aws = require('./aws');
const gh = require('./gh');

function setOutput(labels, instanceId) {
  core.setOutput('labels', labels);
  core.setOutput('ec2-instance-id', instanceId);
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
  setOutput(labels, instanceId);

  await aws.waitForInstanceRunning(instanceId);
  await gh.waitForRunnerRegistered(unique);
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
