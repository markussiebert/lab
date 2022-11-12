import { RemoteBackend, TerraformOutput, TerraformStack } from 'cdktf';
import { Construct } from 'constructs';
import * as sops from '../.gen/providers/sops';
import * as random from '../.gen/providers/random';
import { RemoteBackendHandlerStack } from './RemoteBackendHandlerStack';
import * as tfe from '../.gen/providers/tfe';

export interface RemoteBackendStackProps {
  readonly remoteBackendOrganization: string;
  readonly remoteBackendWorkspace?: string;
  readonly sopsSecretsFile: string;
  readonly dependsOn?: [RemoteBackendStack];
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

    /**
     * Stack Dependencies
     */

    new random.provider.RandomProvider(this, 'RandomProvider');
    const dependsOn: RemoteBackendStack[] = [];

    if (props.remoteBackendHandlerStack) {
      dependsOn.push(props.remoteBackendHandlerStack);
    }

    if (props.dependsOn) {
      dependsOn.concat(props.dependsOn);
    }

    if (dependsOn.length > 0) {
      dependsOn.forEach(stack => {
        const readinessBarrier = new random.id.Id(
          stack,
          `ReadinessBarrier->${this.stackName}`,
          {
            byteLength: 8,
          }
        );
        new TerraformOutput(this, `ReadinessBarrier<-${stack.stackName}`, {
          value: readinessBarrier.hex,
        });
      });
    }
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
