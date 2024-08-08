const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');

function setOutput(labels, ec2InstanceId) {
  core.setOutput('labels', labels);
  core.setOutput('ec2-instance-id', ec2InstanceId);
}

async function start() {
  let labels = config.input.labels;
  if (labels) {
    labels += ',';
  }
  labels += config.generateUniqueLabel();
  const githubRegistrationToken = await gh.getRegistrationToken();
  const ec2InstanceId = await aws.startEc2Instance(labels, githubRegistrationToken);
  setOutput(labels, ec2InstanceId);
  await aws.waitForInstanceRunning(ec2InstanceId);
  await gh.waitForRunnerRegistered(labels);
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
