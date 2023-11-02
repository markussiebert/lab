import { Construct } from 'constructs';
import {
  RemoteBackendStack,
  RemoteBackendStackProps,
} from '../constructs/CustomStack';
import * as flux from '../.gen/providers/flux';
import * as github from '../.gen/providers/github';
import * as kubernetes from '../.gen/providers/kubernetes';
import * as tls from '../.gen/providers/tls';
import * as time from '../.gen/providers/time';


export interface FluxCdStackKubConfigProps extends RemoteBackendStackProps {
  readonly kubeconfigPath?: string;
}

export interface FluxCdStackProps extends FluxCdStackKubConfigProps {
  readonly environment: string;
  readonly githubRepoName: string;
  readonly githubTargetPath: string;
  readonly githubRepoOwner: string;
  readonly githubBranch: string;
}

export class FluxCdStack extends RemoteBackendStack {

  constructor(scope: Construct, name: string, props: FluxCdStackProps) {
    super(scope, name, props);
    /**
     * Generate TLS KeyPair
     */

    new tls.provider.TlsProvider(this, 'TlsProvider');

    const tlsPrivateKey = new tls.privateKey.PrivateKey(this, 'TlsPrivateKey', {
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
        key: tlsPrivateKey.publicKeyOpenssh,
        readOnly: false,
        dependsOn: [tlsPrivateKey]
      }
    );

    new time.provider.TimeProvider(this, 'ProviderTime4Pause');

    const sleep = new time.sleep.Sleep(this, `sleep`, {
      createDuration: '30s',
      dependsOn: [deployKey],
    });

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
              privateKey: tlsPrivateKey.privateKeyPem,
          }
      }
  });
  
  new flux.bootstrapGit.BootstrapGit(this, 'FluxGitBootstrap', {
    path: props.githubTargetPath,
    dependsOn: [sleep],
  });


  
  }
}

export class FluxCdSecretStack extends RemoteBackendStack {
  constructor(scope: Construct, name: string, props: FluxCdStackKubConfigProps) {
    super(scope, name, props);

    new kubernetes.provider.KubernetesProvider(this, 'KubernetesProvider', {
      configPath: props.kubeconfigPath,
    });

    new kubernetes.secret.Secret(this, 'SopsAgeKey', {
        metadata: {
            name: 'sops-age',
            namespace:  'flux-system',
        },
        data: {
            'age.agekey': this.getSopsSecretValue('flux.sops.age_key'),
        },
    });
  }
}