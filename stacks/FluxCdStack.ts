import { Construct } from 'constructs';
import { RemoteBackendStack, RemoteBackendStackProps } from '../constructs/CustomStack';
import * as flux from '../.gen/providers/flux';
import * as github from '../.gen/providers/github';
import * as kubectl from '../.gen/providers/kubectl';
import * as kubernetes from '../.gen/providers/kubernetes';
import * as tls from '../.gen/providers/tls';
import * as local from '../.gen/providers/local';
import { TerraformIterator } from 'cdktf';

export interface FluxCdStackProps extends RemoteBackendStackProps {
    readonly kubeconfigPath?: string;
    readonly environment: string;
    readonly githubRepo: string;
    readonly githubTargetPath: string;
    readonly githubOwner: string;
    readonly githubBranch: string;
}

export class FluxCdStack extends RemoteBackendStack {

  constructor(scope: Construct, name: string, props: FluxCdStackProps ) {

    super(scope, name, props);

    new local.provider.LocalProvider(this, 'LocalProvider');

    /**
     * Prepare Github for Flux
     */
    new github.provider.GithubProvider(this, 'GithubProvider', {
        owner: this.getSopsSecretValue('provider.github.username'),
        token: this.getSopsSecretValue('provider.github.password'),
    });

    new kubernetes.provider.KubernetesProvider(this, 'KubernetesProvider', {
        configPath: props.kubeconfigPath,
    });
    new kubectl.provider.KubectlProvider(this, 'KubeCtlProvider', {
        configPath: props.kubeconfigPath,
    });
    new flux.provider.FluxProvider(this, 'FluxProvider');
    new tls.provider.TlsProvider(this, 'TlsProvider');

    const githubRepo = new github.dataGithubRepository.DataGithubRepository(this, 'GithubRepository', {
        name: props.githubRepo,
    });

    const tlsPrivateKey = new tls.privateKey.PrivateKey(this, 'TlsPrivateKey', {
        algorithm: 'ECDSA',
        ecdsaCurve: 'P256',
    });

    new github.repositoryDeployKey.RepositoryDeployKey(this, 'GithubDeployKey', {
        title: `flux-${props.environment}`,
        repository: githubRepo.name,
        key: tlsPrivateKey.publicKeyOpenssh,
        readOnly: true,
    });

    const fluxCDNamespace = new kubernetes.namespace.Namespace(this, 'FluxCdNamespace', {
        metadata: {
            name: 'flux-system',
        },
        lifecycle: {
            ignoreChanges: [
                'metadata[0].labels',
            ],
        }
    });

    const dataFluxInstall =  new flux.dataFluxInstall.DataFluxInstall(this, 'DataFluxInstall', {
        targetPath: props.githubTargetPath,
    });

    const installDocumentManifest = new kubectl.dataKubectlFileDocuments.DataKubectlFileDocuments(this, 'KubeCtlFileDocumentsInstall', {
        content: dataFluxInstall.content,
    });

    const dataFluxSync = new flux.dataFluxSync.DataFluxSync(this, 'DataFluxSync', {
        targetPath: props.githubTargetPath,
        url: `ssh://git@github.com/${props.githubOwner}/${props.githubRepo}.git`,
        branch: props.githubBranch,

    });

    const syncDocumentManifest = new kubectl.dataKubectlFileDocuments.DataKubectlFileDocuments(this,'KubeCtlFileDocumentsSync', {
        content: dataFluxSync.content,
    });

    const installDocumentManifestIterator = TerraformIterator.fromList(installDocumentManifest.documents);
    const syncDocumentManifestIterator = TerraformIterator.fromList(syncDocumentManifest.documents);

    const manifestInstall = new kubectl.manifest.Manifest(this, 'ManifestInstall', {
        forEach: installDocumentManifestIterator,
        yamlBody: installDocumentManifestIterator.value,
        dependsOn: [fluxCDNamespace]
    });

    new kubectl.manifest.Manifest(this, 'ManifestSync', {
        forEach: syncDocumentManifestIterator,
        yamlBody: syncDocumentManifestIterator.value,
        dependsOn: [fluxCDNamespace]
    });

    new kubernetes.secret.Secret(this, 'FluxCdIdentitySecret', {
        metadata: {
            name: dataFluxSync.secret,
            namespace: dataFluxSync.namespace,
        },
        data: {
            'identity': tlsPrivateKey.privateKeyPem,
            'identity.pub': tlsPrivateKey.publicKeyPem,
            'known_osts': 'github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg='
        },
        dependsOn: [manifestInstall],
    });

    new github.repositoryFile.RepositoryFile(this, 'GithubInstallContent', {
        repository: githubRepo.name,
        file: dataFluxInstall.path,
        content: dataFluxInstall.content,
        branch: props.githubBranch,
    });

    new github.repositoryFile.RepositoryFile(this, 'GithubSyncContent', {
        repository: githubRepo.name,
        file: dataFluxSync.path,
        content: dataFluxSync.content,
        branch: props.githubBranch,
    });

    new github.repositoryFile.RepositoryFile(this, 'GithubKustomizeContent', {
        repository: githubRepo.name,
        file: dataFluxSync.kustomizePath,
        content: dataFluxSync.kustomizeContent,
        branch: props.githubBranch,
    });

  }
}