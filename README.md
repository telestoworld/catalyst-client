# telestoworld Catalyst Client

Welcome to the Catalyst Client library. This client can be used to interact with telestoworld's [Catalyst servers](https://github.com/telestoworld/catalyst). You can both fetch data, or deploy new entities to the server you specify.

## Installation

```bash
npm install tcl-catalyst-client
```

## Usage

You can check the entire API [here](src/CatalystAPI.ts).

This library depends on two other telestoworld libraries:

- [telestoworld Crypto](https://github.com/telestoworld/telestoworld-crypto/)
- [Catalyst Commons](https://github.com/telestoworld/catalyst-commons/)

### Deploying

One of the most important aspects, is the ability to deploy new entities. Here is an example of how to do it:

```
import { CatalystClient, DeploymentBuilder } from 'tcl-catalyst-client'
import { EntityType } from 'tcl-catalyst-commons'
import { Authenticator } from 'tcl-crypto'

// Build entity and group all files
const { entityId, files } = await DeploymentBuilder.buildEntity(EntityType.*, pointers, contentFiles, metadata)

// This is up to you. You will need to figure out how to make the owner of the pointer sign the entity id
const { signature, address } = await sign(entityId)

// You can then create a simple auth chain like this, or a more complex one.
const authChain = Authenticator.createSimpleAuthChain(entityId, address, signature)

// Build the client
const origin = 'name_of_my_app'
const catalyst = await CatalystClient.connectedToCatalystIn('mainnet', origin)
// Note: this operation is expensive, so try to store the created catalyst client somewhere, instead of re-building for each every request

// Build the deploy data
const deployData = { entityId, files, authChain }

// Deploy the actual entity
await catalyst.deployEntity(deployData)

```

## Contributing

### Build and test

```
npm install
npm run build
npm run test
```

### [Releases](https://registry.npmjs.org/tcl-catalyst-client)

#### Stable Releases

To publish a new release, a tag following [SemVer](https://semver.org/) must be done in `master` branch following the format: `MAJOR.MINOR.PATCH` and that will trigger a Github Workflow that publishes the new version of the library, tagging it as `latest`.

#### Master Releases

Every commit to `master` branch triggers a NPM Publish with the beta version following the convention `NEXT_MAJOR.NEXT_MINOR.NEXT_PATCH-TIMESTAMP.commit-COMMIT_SHA`, tagging it as `next`.

#### Tag Releases

If you need to publish a NPM package in a work in progress commit, then you can create a Github Tag, and that will trigger an automatically NPM publish following the convention `NEXT_MAJOR.NEXT_MINOR.NEXT_PATCH-TIMESTAMP.commit-COMMIT_SHA` and tagging it on NPM with your custom tag: `tag-CUSTOM_TAG`.
