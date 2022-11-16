import { App, RemoteBackend, TerraformStack } from 'cdktf';
import { Construct } from 'constructs';
import * as sops from '../.gen/providers/sops';
import * as tfe from '../.gen/providers/tfe';

export interface RemoteBackendStackProps {
  readonly remoteBackendOrganization: string;
  readonly remoteBackendWorkspace?: string;
  readonly sopsSecretsFile: string;
  readonly remoteBackendHandlerStack?: RemoteBackendHandlerStack;
}

export class RemoteBackendStack extends TerraformStack {
  private readonly sopsFile?: sops.dataSopsFile.DataSopsFile;
  public readonly stackName: string;
  public remoteBackendOrganization: string;
  public remoteBackendWorkspace: string;

  constructor(scope: Construct, name: string, props: RemoteBackendStackProps) {
    super(scope, name);

    this.stackName = name;
    this.remoteBackendOrganization = props.remoteBackendOrganization;
    this.remoteBackendWorkspace =
      props.remoteBackendWorkspace ?? this.stackName;

    if (props.remoteBackendHandlerStack) {
      new tfe.workspace.Workspace(
        props.remoteBackendHandlerStack,
        `RemoteBackend-${this.remoteBackendOrganization}-${this.remoteBackendWorkspace}`,
        {
          name: this.remoteBackendWorkspace,
          executionMode: 'local',
          organization: this.remoteBackendOrganization,
        }
      );
      this.addDependency(props.remoteBackendHandlerStack);
    }

    /**
     * Connect to Terraform Cloud
     */

    new RemoteBackend(this, {
      organization: this.remoteBackendOrganization,
      workspaces: {
        name: this.remoteBackendWorkspace,
      },
    });

    /**
     * Sops for Secrets Handling
     */

    new sops.provider.SopsProvider(this, 'ProviderSops');

    this.sopsFile = new sops.dataSopsFile.DataSopsFile(
      this,
      'SopsSecretsFileData',
      {
        sourceFile: props.sopsSecretsFile,
      }
    );
  }

  public getSopsSecretValue(accessor: string): string {
    if (this.sopsFile !== undefined) {
      return this.sopsFile.data.lookup(accessor);
    }
    throw new Error(
      'Sops not initialized! You have to pass the path to the sopsfile via the StackProperties.'
    );
  }
}
export class RemoteBackendHandlerStack extends RemoteBackendStack {
  readonly stackName: string;

  constructor(scope: App, name: string, props: RemoteBackendStackProps) {
    super(scope, name, props);

    this.stackName = name;

    new tfe.provider.TfeProvider(this, 'TfeProvider');
  }
}