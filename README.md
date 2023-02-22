# vilin_projekti

## Orchestrator
Running orchestrator and its database only:
```
docker compose up --build
```

OR you can use the VSCode GUI:
1. Right click `docker-compose.yml` file from explorer
2. Select "Compose Up - Select Services"
3. Select "profiles"
4. Do not select "ABSTRACT_BASE_HACK_DO_NOT_USE"
5. Click "OK"

## Devices
You can test how orchestrator interacts with devices by running the containers
in the same compose (TODO Define common network for testing any new container)
for example by clicking the _⏵ button_ on Docker Desktop GUI.

Also running the simulated devices with one command:
```
docker compose --profile device up --build
```
### Adding new devices to Docker compose
When adding a brand new device to your local Docker compose -simulation, you
have to (in addition to the entries into `.yml`) add its config-files into its
Docker-volume after running.

This can be achieved for example with (replace `<service name>`,
`<device type>`, `<config type>` and `<your container>`):
```powershell
<# First run the container. #>
docker compose up <device name> --build -d;
<# Then copy the needed description into it. #>
docker cp `
./client/files/<your device type>.<config type>-description.json `
<your container>:/app/configs/device-description.json
```



## Setup

### TL;DR

Tested on Windows 10:
```powershell
git clone git@gitlab.jyu.fi:wasmiot/wasmiot-orchestrator.git
cd .\wasmiot-orchestrator\
git clone git@gitlab.jyu.fi:wasmiot/flask-host.git
git submodule init
git submodule update
docker compose up
```

### Supervisor (git submodule)
The supervisor is a _git submodule_ so clone and update it following the command's documentation: https://git-scm.com/book/en/v2/Git-Tools-Submodules

For example cloning would go like this:
```
git clone git@gitlab.jyu.fi:wasmiot/wasmiot-orchestrator.git
git submodule init
git submodule update
```

The command `git submodule update` might complain on Windows with unauthorized
access to which some workarounds are:
- Start using WSL2 (the [Remote
  Development](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack)
  VSCode extension might be useful/required).
- Based on a [similar situation on Stack
  Overflow](https://stackoverflow.com/questions/60850933/git-submodule-update-permission-denied),
  it seems that updates should start working as normal after the submodule is
  first __manually cloned__ into its directory.

The supervisor also needs the following (if using docker, then compose should handle all these):
  - a `configs` directory at its root containing files:
    - `remote_functions.json`
    - `modules.json`
  - Some environment variables TODO which?

---

## Debugging
For debugging, the devcontainer should work quite well with just using VSCode
like you would locally.

__Something that has to be done though__, is to __manually__ run `npm
install` after getting inside the container (This might be because of bind mounting with
the current project directory structure?). Note that this will also result in a
_local_ `node_modules` directory in all its glory.

## Getting started

To make it easy for you to get started with GitLab, here's a list of recommended next steps.

Already a pro? Just edit this README.md and make it your own. Want to make it easy? [Use the template at the bottom](#editing-this-readme)!

## Add your files

- [ ] [Create](https://docs.gitlab.com/ee/user/project/repository/web_editor.html#create-a-file) or [upload](https://docs.gitlab.com/ee/user/project/repository/web_editor.html#upload-a-file) files
- [ ] [Add files using the command line](https://docs.gitlab.com/ee/gitlab-basics/add-file.html#add-a-file-using-the-command-line) or push an existing Git repository with the following command:

```
cd existing_repo
git remote add origin https://gitlab.jyu.fi/wasmiot/vilin_projekti.git
git branch -M main
git push -uf origin main
```

## Integrate with your tools

- [ ] [Set up project integrations](https://gitlab.jyu.fi/wasmiot/vilin_projekti/-/settings/integrations)

## Collaborate with your team

- [ ] [Invite team members and collaborators](https://docs.gitlab.com/ee/user/project/members/)
- [ ] [Create a new merge request](https://docs.gitlab.com/ee/user/project/merge_requests/creating_merge_requests.html)
- [ ] [Automatically close issues from merge requests](https://docs.gitlab.com/ee/user/project/issues/managing_issues.html#closing-issues-automatically)
- [ ] [Enable merge request approvals](https://docs.gitlab.com/ee/user/project/merge_requests/approvals/)
- [ ] [Automatically merge when pipeline succeeds](https://docs.gitlab.com/ee/user/project/merge_requests/merge_when_pipeline_succeeds.html)

## Test and Deploy

Use the built-in continuous integration in GitLab.

- [ ] [Get started with GitLab CI/CD](https://docs.gitlab.com/ee/ci/quick_start/index.html)
- [ ] [Analyze your code for known vulnerabilities with Static Application Security Testing(SAST)](https://docs.gitlab.com/ee/user/application_security/sast/)
- [ ] [Deploy to Kubernetes, Amazon EC2, or Amazon ECS using Auto Deploy](https://docs.gitlab.com/ee/topics/autodevops/requirements.html)
- [ ] [Use pull-based deployments for improved Kubernetes management](https://docs.gitlab.com/ee/user/clusters/agent/)
- [ ] [Set up protected environments](https://docs.gitlab.com/ee/ci/environments/protected_environments.html)

***

# Editing this README

When you're ready to make this README your own, just edit this file and use the handy template below (or feel free to structure it however you want - this is just a starting point!).  Thank you to [makeareadme.com](https://www.makeareadme.com/) for this template.

## Suggestions for a good README
Every project is different, so consider which of these sections apply to yours. The sections used in the template are suggestions for most open source projects. Also keep in mind that while a README can be too long and detailed, too long is better than too short. If you think your README is too long, consider utilizing another form of documentation rather than cutting out information.

## Name
Choose a self-explaining name for your project.

## Description
Let people know what your project can do specifically. Provide context and add a link to any reference visitors might be unfamiliar with. A list of Features or a Background subsection can also be added here. If there are alternatives to your project, this is a good place to list differentiating factors.

## Badges
On some READMEs, you may see small images that convey metadata, such as whether or not all the tests are passing for the project. You can use Shields to add some to your README. Many services also have instructions for adding a badge.

## Visuals
Depending on what you are making, it can be a good idea to include screenshots or even a video (you'll frequently see GIFs rather than actual videos). Tools like ttygif can help, but check out Asciinema for a more sophisticated method.

## Installation
Within a particular ecosystem, there may be a common way of installing things, such as using Yarn, NuGet, or Homebrew. However, consider the possibility that whoever is reading your README is a novice and would like more guidance. Listing specific steps helps remove ambiguity and gets people to using your project as quickly as possible. If it only runs in a specific context like a particular programming language version or operating system or has dependencies that have to be installed manually, also add a Requirements subsection.

## Usage
Use examples liberally, and show the expected output if you can. It's helpful to have inline the smallest example of usage that you can demonstrate, while providing links to more sophisticated examples if they are too long to reasonably include in the README.

## Support
Tell people where they can go to for help. It can be any combination of an issue tracker, a chat room, an email address, etc.

## Roadmap
If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing
State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment
Show your appreciation to those who have contributed to the project.

## License
For open source projects, say how it is licensed.

## Project status
If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
