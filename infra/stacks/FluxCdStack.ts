import { Construct } from 'constructs';
import {
  RemoteBackendStack,
  RemoteBackendStackProps,
} from '../constructs/CustomStack';
import * as flux from '../.gen/providers/flux';
import * as github from '../.gen/providers/github';
import * as kubernetes from '../.gen/providers/kubernetes';
import * as tls from '../.gen/providers/tls';


export interface FluxCdPrepareStackProps extends RemoteBackendStackProps {
  readonly environment: string;
  readonly githubRepoName: string;
}

export interface FluxCdStackProps extends RemoteBackendStackProps {
  readonly kubeconfigPath?: string;
  readonly environment: string;
  readonly githubRepoName: string;
  readonly githubTargetPath: string;
  readonly githubRepoOwner: string;
  readonly githubBranch: string;
  readonly tlsPrivateKey: tls.privateKey.PrivateKey;
}

export class FluxCdPrepareStack extends RemoteBackendStack {

  public tlsPrivateKey: tls.privateKey.PrivateKey;

  constructor(scope: Construct, name: string, props: FluxCdPrepareStackProps) {
    super(scope, name, props);
    /**
     * Generate TLS KeyPair
     */

    new tls.provider.TlsProvider(this, 'TlsProvider');

    this.tlsPrivateKey = new tls.privateKey.PrivateKey(this, 'TlsPrivateKey', {
      algorithm: 'ECDSA',
      ecdsaCurve: 'P256',
    });

    /**
     * Prepare Github for Flux
     */

    new github.provider.GithubProvider(this, 'GithubProvider', {
        owner: this.getSopsSecretValue('provider.github.username'),
        token: this.getSopsSecretValue('provider.github.password'),
    });
  
    const deployKey = new github.repositoryDeployKey.RepositoryDeployKey(
        this,
        'GithubDeployKey',
        {
          title: `flux-${props.environment}`,
          repository: props.githubRepoName,
          key: this.tlsPrivateKey.publicKeyOpenssh,
          readOnly: false,
        }
      );
      deployKey.node.addDependency(this.tlsPrivateKey);
  }
}

export class FluxCdStack extends RemoteBackendStack {
  constructor(scope: Construct, name: string, props: FluxCdStackProps) {
    super(scope, name, props);

    new kubernetes.provider.KubernetesProvider(this, 'KubernetesProvider', {
      configPath: props.kubeconfigPath,
    });

    /**
     * Bootstrap Flux
     */

    new flux.provider.FluxProvider(this, 'FluxProvider', {
        kubernetes: {
            configPath: props.kubeconfigPath,
        },
        git: {
            url: `ssh://git@github.com/${props.githubRepoOwner}/${props.githubRepoName}.git`,
            ssh: {
                username: 'git',
                privateKey: props.tlsPrivateKey.privateKeyPem,
            }
        }
    });
    
    const bs = new flux.bootstrapGit.BootstrapGit(this, 'FluxGitBootstrap', {
        path: props.githubTargetPath,
    });

    new kubernetes.secret.Secret(this, 'SopsAgeKey', {
        metadata: {
            name: 'sops-age',
            namespace:  'flux-system',
        },
        data: {
            'age.agekey': this.getSopsSecretValue('flux.sops.age_key'),
        },
        dependsOn: [bs],
    });
  }
}
