import { RemoteBackend, TerraformStack } from "cdktf";
import { Construct } from "constructs";
import * as sops from '../.gen/providers/sops';


export interface RemoteBackendStackProps {
    readonly remoteBackend: string;
    readonly sopsSecretsFile?: string;
}

export class RemoteBackendStack extends TerraformStack {

    private readonly sopsFile?: sops.dataSopsFile.DataSopsFile;

    constructor(scope: Construct, name: string, props: RemoteBackendStackProps) {
        super(scope, name);

        /**
         * Connect to Terraform Cloud
         */

        const remoteBackend = props.remoteBackend.split('/');

        if ( remoteBackend.length < 2) {
            throw new Error(`Could not parse remoteBackend configuration! Expected "organization/workspace" got ${props.remoteBackend}`);
        }

        new RemoteBackend(this, {
            organization: remoteBackend.shift()!,
            workspaces: {
                name: remoteBackend.join('/'),
            },
        });

        /**
         * Sops for Secrets Handling
         */
        
        if ( props.sopsSecretsFile !== undefined ) {
            new sops.provider.SopsProvider(this, 'ProviderSops');
            this.sopsFile = new sops.dataSopsFile.DataSopsFile(this, 'SopsSecretsFileData', {
                sourceFile: props.sopsSecretsFile
            });
        }
    }

    public getSopsSecretValue(accessor: string): string {
        if ( this.sopsFile !== undefined ) {
            return this.sopsFile.data.lookup(accessor)
        }
        throw new Error("Sops not initialized! You have to pass the path to the sopsfile via the StackProperties.");
    }
}