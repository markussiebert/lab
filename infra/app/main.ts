import * as path from 'path';
import { App } from 'cdktf';
import { RemoteBackendHandlerStack } from '../constructs/CustomStack';
import { UnifiNetworkSetupStack } from '../stacks/UnifiNetworkSetupStack';
import { ProxmoxVmStack } from '../stacks/ProxmoxVmStack';
import { TalosClusterStack } from '../stacks/TalosClusterStack';
import { FluxCdSecretStack, FluxCdStack } from '../stacks/FluxCdStack';

const app = new App();

/**
 * Prepare RemoteBackends
 */

const remoteBackendHandlerStack = new RemoteBackendHandlerStack(
  app,
  'RemoteBackendHandlerStack', {
    remoteBackendOrganization: 'LabFamilieSiebert',
    sopsSecretsFile: path.join(__dirname, '../../secrets/secrets.sops.yaml'),
  }
);

/**
 * Prepare Network
 */

const stackUnifiNetworkSetup = new UnifiNetworkSetupStack(
  app,
  'UnifiNetworkSetupStack',
  {
    remoteBackendHandlerStack,
  }
);

const unifiNetworkHomelab = stackUnifiNetworkSetup.addNetwork({
  name: 'HomeLab',
  purpose: 'corporate',
  vlanId: 10,
  dhcpEnabled: true,
  dhcpStart: '192.168.10.10',
  dhcpStop: '192.168.10.200',
  dhcpdBootEnabled: false,
  dhcpV6Start: '::2',
  dhcpV6Stop: '::7d1',
  ipv6PdStart: '::2',
  ipv6PdStop: '::7d1',
  ipv6RaPriority: 'high',
  internetAccessEnabled: true,
  subnet: '192.168.10.1/24',
});

unifiNetworkHomelab.addClient({
  name: 'pve',
  mac: '1c:83:4f:ff:fc:c2',
  fixedIp: '192.168.10.10',
});

/**
 * Prepare Talos VM
 */

const stackTalosVMs = new ProxmoxVmStack(
 app,
 'TalosVm',
 {
   remoteBackendHandlerStack,
 }
);

stackTalosVMs.addDependency(stackUnifiNetworkSetup);

const talosVM = stackTalosVMs.addVirtualMachine({
 name: `talos`,
 vmid: 120,
 fixedIp: `192.168.10.20`,
 cores: 4,
 memory: 16,
 storage: 8,
 unifiNetwork: unifiNetworkHomelab,
 boot: 'order=scsi0;ide2',
 iso: 'local:iso/metal-amd64.iso',
 pause: '60s',
})

const stackTalosStageCluster = new TalosClusterStack(
 app,
 'TalosStageCluster', {
   vipIp: '192.168.10.20', // now the one and only host ip
   clusterName: 'talos',
   remoteBackendHandlerStack,
 },
);
stackTalosStageCluster.addDependency(stackTalosVMs);
stackTalosStageCluster.saveTalosConfig(path.join(__dirname, '../../connect/talosconfig/talos-stage'));
stackTalosStageCluster.addControlPlaneNode(talosVM.name, talosVM.fixedIp, path.join(__dirname, `../../connect/kubeconfig/talos-kubeconfig`));
stackTalosStageCluster.setupCilium(path.join(__dirname, `../../connect/kubeconfig/talos-kubeconfig`));

const fluxCdStack = new FluxCdStack(app, 'TalosFluxCd', {
 environment: 'main',
 githubBranch: 'main',
 githubRepoOwner: 'markussiebert',
 githubRepoName: 'lab',
 githubTargetPath: 'flux/stage',
 kubeconfigPath: path.join(__dirname, `../../connect/kubeconfig/talos-kubeconfig`),
 remoteBackendHandlerStack,
})
fluxCdStack.addDependency(stackTalosStageCluster)

new FluxCdSecretStack(app, 'TalosFluxCdSecrets', {
  kubeconfigPath: path.join(__dirname, `../../connect/kubeconfig/talos-kubeconfig`),
  remoteBackendHandlerStack,
}).addDependency(fluxCdStack)
app.synth();
