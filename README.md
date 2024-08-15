# On-demand self-hosted AWS EC2 runner for GitHub Actions

[![awesome-runners](https://img.shields.io/badge/listed%20on-awesome--runners-blue.svg)](https://github.com/jonico/awesome-runners)

Start your EC2 [self-hosted runner](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners) right before you need it.
Run the job on it.
Finally, stop it when you finish.
And all this automatically as a part of your GitHub Actions workflow.

![GitHub Actions self-hosted EC2 runner](docs/images/github-actions-summary.png)

_See [below](#example) for the YAML code that depicts this workflow._ <br><br>

## Downstream changes

The following changes were made in **this fork** of the upstream GitHub repo [machulav/ec2-github-runner](https://github.com/machulav/ec2-github-runner):

- Migrated use of **AWS SDK for JavaScript** from v2 to v3 to suppress deprecation warnings.

- Added option to launch the EC2 instance as a **Spot instance** (see `spot-instance` input).

- Added options to specify the type and size of the **root EBS volume** (see `root-volume-device`, `root-volume-type`, and `root-volume-size` inputs).

- Renamed `label` input to **`labels`** to accept one or more labels (as CSV) to pass to the runner's `config.sh` script. <br>
  The `label` output is similarly renamed to **`labels`** and is the set of input labels, if any, plus a randomly generated ID.

- Regardless if any resource tags were provided as input, a **Labels tag** will always be added that includes any labels provided as input, plus the unique, generated label.

- EC2 instance user data script will always install the **latest version** of the [GitHub Actions Runner](https://github.com/actions/runner/releases/latest) _(this may or may not cause an issue)._

- `pre-runner-script` input can span more than one line (improved the creation of the `pre-runner-script.sh` file), <br>
  and that script will get `source`d in a Bash shell with `-e -u -x -o pipefail` options.

- Added `--unattended` as an extra parameter to the runner's `config.sh` script (see [issue #197](https://github.com/machulav/ec2-github-runner/issues/197)).

- Added `runner-name` output. It is the EC2 instance hostname, which may be customized by the `pre-runner-script`.

**NOTE:** Due to the renaming of an input parameter, the major version (at time of fork) has been bumped from the upstream release to **`v3`**.

<br>

## Table of contents

- [Use cases](#use-cases)
  - [Access private resources in your VPC](#access-private-resources-in-your-vpc)
  - [Customize hardware configuration](#customize-hardware-configuration)
  - [Save costs](#save-costs)
- [Usage](#usage)
  - [How to start](#how-to-start)
  - [Inputs](#inputs)
  - [Environment variables](#environment-variables)
  - [Outputs](#outputs)
  - [Example](#example)
  - [Real user examples](#real-user-examples)
- [Self-hosted runner security with public repositories](#self-hosted-runner-security-with-public-repositories)
- [License summary](#license-summary)

## Use cases

### Access private resources in your VPC

The action can start the EC2 instance in any subnet of your VPC that you need, public or private.
In this way, you can easily access any private resources in your VPC from your GitHub Actions workflow.

For example, you can access your database in the private subnet to run the database migration.

### Customize hardware configuration

GitHub provides one fixed hardware configuration for their Linux virtual machines: 2-core CPU, 7 GB of RAM, 14 GB of SSD disk space.

Some of your CI workloads may require more powerful hardware than GitHub-hosted runners provide or ARM-based CPUs that the free plan currently doesn't provide.

In the action, you can configure any EC2 instance type for your runner that AWS provides, such as one with ARM-based Graviton CPUs.

For example, you can run a `c5.4xlarge` EC2 runner for some of your compute-intensive workloads, or a `r5.xlarge` EC2 runner for workloads that process large data sets in memory.

### Run jobs longer than 6 hours

GitHub-hosted runners have a hard [limit of 6 hours](https://docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration#usage-limits) for a job to complete,
so if you are exceeding that limit, use a self-hosted runner that extends that [limit to 5 days](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners#usage-limits).

### Save costs

If your CI workloads don't need the power of the GitHub-hosted runners and the execution takes more than a couple of minutes,
you can consider running it on a cheaper and less powerful instance from AWS.

According to [GitHub's documentation](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners/about-self-hosted-runners), you don't need to pay for the jobs handled by the self-hosted runners:

> Self-hosted runners are free to use with GitHub Actions, but you are responsible for the cost of maintaining your runner machines.

So you will be charged by GitHub only for the time the self-hosted runner start and stop.
EC2 self-hosted runner will handle everything else so that you will pay for it to AWS, which can be less expensive than the price for the GitHub-hosted runner.

## Usage

### How to start

Use the following steps to prepare your workflow for running on your EC2 self-hosted runner:

**1. Prepare IAM user with AWS access keys**

1. Create new AWS access keys for the new or an existing IAM user with the following least-privilege minimum required permissions:

   <!-- prettier-ignore -->
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ec2:RunInstances",
           "ec2:TerminateInstances",
           "ec2:DescribeInstances",
           "ec2:DescribeInstanceStatus"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

   If you plan to attach an IAM role to the EC2 runner with the `iam-role-name` parameter, you will need to allow additional permissions:

   <!-- prettier-ignore -->
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ec2:ReplaceIamInstanceProfileAssociation",
           "ec2:AssociateIamInstanceProfile"
         ],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": "iam:PassRole",
         "Resource": "*"
       }
     ]
   }
   ```

   If you use the `aws-resource-tags` parameter, you will also need to allow the permissions to create tags:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["ec2:CreateTags"],
         "Resource": "*",
         "Condition": {
           "StringEquals": {
             "ec2:CreateAction": "RunInstances"
           }
         }
       }
     ]
   }
   ```

   These example policies above are provided as a guide. They can—and most likely should be—limited even more by specifying the actual resources you will use.

2. Add the keys to GitHub secrets.
3. Use the [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action to set up the keys as environment variables.

**2. Prepare GitHub personal access token**

1. Create a new GitHub personal access token with `repo` scope.
   If creating a fine-grained access token, be sure to include **Read and write** access for [**Administration**](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens?apiVersion=2022-11-28#repository-permissions-for-administration) repository permissions.
   The action will use the token for self-hosted runners management in the GitHub account on the repository level.

2. Add the token to GitHub secrets.

**3. Prepare EC2 image**

1. Create a new EC2 instance based on any Linux distribution you need.
2. Connect to the instance using Systems Manager, install `git` and `docker`, and then enable the Docker daemon.

   For **Amazon Linux 2023**, it looks like the following:

   ```bash
   sudo dnf update && \
   sudo dnf install -y git docker libicu && \
   sudo systemctl enable docker
   ```

   For other Linux distributions, it could be slightly different.

3. Install any other tools required for your workflow.
4. Create a new EC2 image (AMI) from the instance.
5. Remove the instance if not required anymore after the image is created.

Alternatively, you can use a vanilla EC2 AMI and set up the dependencies via `pre-runner-script` in the workflow YAML file. See example in the `pre-runner-script` documentation below.

**4. Prepare VPC with subnet and security group**

1. Create a new VPC and a new subnet in it.
   Or use the existing VPC and subnet.
2. Create a new security group for the runners in the VPC.
   Only the outbound traffic on port 443 should be allowed for pulling jobs from GitHub.
   No inbound traffic is required.

**5. Configure the GitHub workflow**

1. Create a new GitHub Actions workflow or edit the existing one.
2. Use the documentation and example below to configure your workflow.
3. Please don't forget to set up a job for removing the EC2 instance at the end of the workflow execution.
   Otherwise, the EC2 instance won't be removed and continue to run even after the workflow execution is finished.

Now you're ready to go!

### Inputs

<!-- prettier-ignore-start -->
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Required                                   | Description                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                                                                                                                                                                       | Always required.                           | Specify here which mode you want to use: <br><br> - `start` - to start a new runner; <br> - `stop` - to stop the previously created runner.                                                                                                                                                                                           |
| `github-token`                                                                                                                                                               | Always required.                           | GitHub Personal Access Token with the `repo` scope assigned.                                                                                                                                                                                                                                                                          |
| `ec2-image-id`                                                                                                                                                               | Required if you use the `start` mode.      | EC2 Image ID (AMI). <br><br> The new runner will be launched from this image. <br><br> This action is compatible with Amazon Linux 2023 images.                                                                                                                                                                                       |
| `ec2-instance-type`                                                                                                                                                          | Required if you use the `start` mode.      | EC2 Instance Type.                                                                                                                                                                                                                                                                                                                    |
| `subnet-id`                                                                                                                                                                  | Required if you use the `start` mode.      | VPC Subnet ID. <br><br> The subnet should belong to the same VPC as the specified security group.                                                                                                                                                                                                                                     |
| `security-group-id`                                                                                                                                                          | Required if you use the `start` mode.      | EC2 Security Group ID. <br><br> The security group should belong to the same VPC as the specified subnet. <br><br> Only outbound traffic for port 443 should be allowed. No inbound traffic is required.                                                                                                                              |
| `labels`                                                                                                                                                                     | Required if you use the `stop` mode.       | Name(s) (in CSV form) of unique labels to assign to the runner. <br><br> These labels will be appended to by the output of the action in the `start` mode to include a unique ID. <br><br> Use these labels to remove the runner from GitHub when the runner is no longer needed.                                                     |
| `ec2-instance-id`                                                                                                                                                            | Required if you use the `stop` mode.       | EC2 Instance ID of the created runner. <br><br> This ID is provided by the output of the action in `start` mode. <br><br> This ID is used to terminate the EC2 instance when the runner is no longer needed.                                                                                                                          |
| `iam-role-name`                                                                                                                                                              | Optional. Used only with the `start` mode. | IAM role name to attach to the created EC2 runner. <br><br> This allows the runner to have permissions to run additional actions within the AWS account, without having to manage additional GitHub secrets and AWS users. <br><br> Setting this requires additional AWS permissions for the role launching the instance (see above). |
| `spot-instance`                                                                                                                                                              | Optional. Used only with the `start` mode. | Whether to launch the runner as a Spot instance. <br><br> If set to `'true'`, the runner will be launched as a Spot instance with default options.                                                                                                                                                                                    |
| `root-volume-device`                                                                                                                                                         | Optional. Used only with the `start` mode. | Root volume device name. <br><br> The default value is `/dev/xvda`, but depends on the AMI used.                                                                                                                                                                                                                                      |
| `root-volume-type`                                                                                                                                                           | Optional. Used only with the `start` mode. | Root volume type. <br><br> The default value is `gp3`.                                                                                                                                                                                                                                                                                |
| `root-volume-size`                                                                                                                                                           | Optional. Used only with the `start` mode. | Root volume size in GiB. <br><br> The default value is `'8'`.                                                                                                                                                                                                                                                                         |
| `aws-resource-tags`                                                                                                                                                          | Optional. Used only with the `start` mode. | Specifies tags to add to the EC2 instance and any attached storage. <br><br> This field is a stringified JSON array of tag objects, each containing a `Key` and `Value` field (see example below). <br><br> Setting this requires additional AWS permissions for the role launching the instance (see above).                         |
| `runner-home-dir`                                                                                                                                                            | Optional. Used only with the `start` mode. | Specifies a directory where pre-installed actions-runner software and scripts are located.                                                                                                                                                                                                                                            |
| `pre-runner-script`                                                                                                                                                          | Optional. Used only with the `start` mode. | Specifies Bash commands to run as the root user before the runner starts. It's useful for installing dependencies with `apt-get`, `yum`, `dnf`, etc. For example: <pre> - name: Start EC2 runner <br>   with: <br>     mode: start <br>     ... <br>     pre-runner-script: \| <br>       dnf update && \ <br>       dnf install -y git docker libicu && \ <br>       systemctl enable docker </pre> Please be aware that the commands will be sourced by Bash with `-e -u -x -o pipefail` options set, so suppress harmless errors using `false \|\| true` construct if necessary. |
<!-- prettier-ignore-end -->

### Environment variables

In addition to the inputs described above, the action also requires the following environment variables to access your AWS account:

- `AWS_DEFAULT_REGION` or `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

We recommend using the [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action right before running the step for creating a self-hosted runner. This action perfectly does the job of setting the required environment variables.

### Outputs

| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Description                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `labels`                                                                                                                                                                     | Name(s) (in CSV form) of input labels, if any, plus a unique label assigned to the runner. <br><br> These labels are used in two cases: <br> - to use as the `runs-on` property value of subsequent jobs; <br> - to remove the runner from GitHub when it is no longer needed. |
| `ec2-instance-id`                                                                                                                                                            | EC2 Instance ID of the created runner. <br><br> This ID is used to terminate the EC2 instance when the runner is no longer needed.                                                                                                                                             |
| `runner-name`                                                                                                                                                                | Name of the created runner. <br><br> This is the EC2 instance hostname, which may be customized by the `pre-runner-script`.                                                                                                                                                    |

### Example

The workflow showed in the picture above and declared in `do-the-job.yml` looks like this:

<!-- prettier-ignore -->
```yaml
name: do-the-job
on: pull_request
jobs:
  launch-runner:
    name: Launch self-hosted EC2 runner
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-region: ${{ secrets.AWS_REGION }}
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      - name: Start EC2 runner
        id: start-runner
        uses: erhhung/ec2-github-runner@v3
        env:
          RUN_INFO: ${{ github.run_id }}-${{ github.run_attempt }}
        with:
          mode: start
          github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
          labels: prod,AL2023
          ec2-image-id: ami-123
          ec2-instance-type: t3.nano
          subnet-id: subnet-123
          security-group-id: sg-123
          iam-role-name: my-role-name   # optional, requires additional permissions
          spot-instance: 'true'         # optional, default is 'false'
          root-volume-device: /dev/xvda # optional, default is /dev/xvda
          root-volume-type: gp3         # optional, default is gp3
          root-volume-size: '16'        # optional, default is '8' GiB
          aws-resource-tags: >          # optional, requires additional permissions
            [
              {"Key": "Name", "Value": "github-runner-${{ env.RUN_INFO }}"},
              {"Key": "GitHubRepo", "Value": "${{ github.repository }}"}
            ]
          pre-runner-script: |
            hostname="runner-$(date '+%y%m%d%H%M')-${{ env.RUN_INFO }}" && \
            hostnamectl set-hostname $hostname ## host name == runner name
            dnf update && \
            dnf install -y git docker libicu && \
            systemctl start docker
      - name: Prepare job output
        id: prepare-output
        run: |
          csv="self-hosted,${{ steps.start-runner.outputs.labels }}"
          cat <<EOF >> $GITHUB_OUTPUT
          labels-csv=$csv
          labels-json=["${csv//,/\",\"}"]
          EOF
    outputs:
      labels-csv:  '${{ steps.prepare-output.outputs.labels-csv }}'
      labels-json: '${{ steps.prepare-output.outputs.labels-json }}'
      instance-id:  ${{ steps.start-runner.outputs.ec2-instance-id }}
      runner-name:  ${{ steps.start-runner.outputs.runner-name }}

  do-the-job:
    name: Do the job on the runner
    needs: launch-runner # required to start the main job when the runner is ready
    runs-on: ${{ fromJSON( needs.launch-runner.outputs.labels-json ) }} # run the job on the newly created runner
    steps:
      - name: Hello World
        run: echo 'Hello World!'

  terminate-runner:
    name: Terminate self-hosted EC2 runner
    needs:
      - launch-runner # required to get output from the launch-runner job
      - do-the-job    # required to wait when the main job is done
    runs-on: ubuntu-latest
    if: ${{ always() }} # required to stop the runner even if errors occurred in previous jobs
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-region: ${{ secrets.AWS_REGION }}
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      - name: Stop EC2 runner
        uses: erhhung/ec2-github-runner@v3
        with:
          mode: stop
          github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
          labels: ${{ needs.launch-runner.outputs.labels-csv }}
          ec2-instance-id: ${{ needs.launch-runner.outputs.instance-id }}
```

### Real user examples

In [this discussion](https://github.com/machulav/ec2-github-runner/discussions/19), you can find feedback and examples from the users of the action.

If you use this action in your workflow, feel free to add your story there as well 🙌

## Self-hosted runner security with public repositories

> We recommend that you do not use self-hosted runners with public repositories.
>
> Forks of your public repository can potentially run dangerous code on your self-hosted runner machine by creating a pull request that executes the code in a workflow.

Please find more details about this security note on [GitHub documentation](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners/about-self-hosted-runners#self-hosted-runner-security-with-public-repositories).

## License summary

This code is made available under the [MIT license](LICENSE).
