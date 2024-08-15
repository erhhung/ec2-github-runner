const core = require('@actions/core');
const config = require('./config');

const { EC2Client, RunInstancesCommand, waitUntilInstanceRunning, TerminateInstancesCommand } = require('@aws-sdk/client-ec2');
const client = new EC2Client();

// User data scripts are run as the root user
function buildUserDataScript(labels, githubRegistrationToken) {
  if (config.input.runnerHomeDir) {
    // If runner home directory is specified, we expect the actions-runner software (and dependencies)
    // to be pre-installed in the AMI, so we simply cd into that directory and then start the runner
    return [
      '#!/bin/bash',
      'set -euxo pipefail',
      `cd "${config.input.runnerHomeDir}"`,
      `cat <<'EOF' > pre-runner-script.sh\n${config.input.preRunnerScript}\nEOF`,
      'source pre-runner-script.sh',
      'export RUNNER_ALLOW_RUNASROOT=1',
      `./config.sh --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels "${labels}" --unattended`,
      './run.sh',
    ];
  } else {
    return [
      '#!/bin/bash',
      'set -euxo pipefail',
      'mkdir -p actions-runner && cd actions-runner',
      `cat <<'EOF' > pre-runner-script.sh\n${config.input.preRunnerScript}\nEOF`,
      'source pre-runner-script.sh',
      // Install the latest version of the Linux runner
      'REL="https://github.com/actions/runner/releases"',
      "VER=$(curl -Is ${REL}/latest | sed -En 's/^location:.+\\/tag\\/(.+)\\r$/\\1/p')",
      'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
      'curl -sL ${REL}/download/${VER}/actions-runner-linux-${RUNNER_ARCH}-${VER#v}.tar.gz | tar -xz',
      'export RUNNER_ALLOW_RUNASROOT=1',
      `./config.sh --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels "${labels}" --unattended`,
      './run.sh',
    ];
  }
}

async function startEc2Instance(labels, githubRegistrationToken) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/command/RunInstancesCommand
  const userData = buildUserDataScript(labels, githubRegistrationToken);

  // add the "Labels" tag to the tag list
  config.tagSpecifications[0].Tags.push({
    Key: 'Labels',
    Value: labels.replace(/(?<=,)(?=\S)/g, ' '),
  });

  const input = {
    MinCount: 1,
    MaxCount: 1,
    ImageId: config.input.imageId,
    InstanceType: config.input.instanceType,
    InstanceMarketOptions: config.input.spotInstance ? { MarketType: 'spot' } : undefined,
    EbsOptimized: true,
    BlockDeviceMappings: [
      {
        DeviceName: config.input.rootVolumeDevice,
        Ebs: {
          VolumeType: config.input.rootVolumeType,
          VolumeSize: Number(config.input.rootVolumeSize),
          Encrypted: true,
        },
      },
    ],
    SubnetId: config.input.subnetId,
    SecurityGroupIds: [config.input.securityGroupId],
    IamInstanceProfile: { Name: config.input.iamRoleName },
    UserData: Buffer.from(userData.join('\n')).toString('base64'),
    TagSpecifications: config.tagSpecifications,
  };
  core.info('Calling RunInstances with input:');
  core.info(JSON.stringify(input, null, 2));

  try {
    const command = new RunInstancesCommand(input);
    const response = await client.send(command);
    const instanceId = response.Instances[0].InstanceId;
    core.info(`AWS EC2 instance ${instanceId} has started`);
    return instanceId;
  } catch (error) {
    core.error('AWS EC2 instance launch error');
    throw error;
  }
}

async function waitForInstanceRunning(instanceId) {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-ec2/Variable/waitUntilInstanceRunning
  const params = {
    client: client,
    maxWaitTime: 60 * 5,
  };
  const input = {
    InstanceIds: [instanceId],
  };

  try {
    await waitUntilInstanceRunning(params, input);
    core.info(`AWS EC2 instance ${instanceId} is up and running`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instance ${instanceId} initialization error`);
    throw error;
  }
}

async function terminateEc2Instance() {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/command/TerminateInstancesCommand
  const input = {
    InstanceIds: [config.input.instanceId],
  };

  try {
    const command = new TerminateInstancesCommand(input);
    await client.send(command);
    core.info(`AWS EC2 instance ${config.input.instanceId} has terminated`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instance ${config.input.instanceId} termination error`);
    throw error;
  }
}

module.exports = {
  startEc2Instance,
  waitForInstanceRunning,
  terminateEc2Instance,
};
