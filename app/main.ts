import { App } from 'cdktf';
import path = require('path');
import { RemoteBackendHandlerStack } from '../constructs/RemoteBackendHandlerStack';
import { download } from '../helper/Downloader';
import { ProxmoxVmStack, VirtualMachine } from '../stacks/ProxmoxVmStack';
import { TalosClusterStack } from '../stacks/TalosClusterStack';
import { UnifiNetworkSetupStack } from '../stacks/UnifiNetworkSetupStack';

const app = new App();

/**
 * Presets
 */
const talosVersion = 'v1.2.6';
const talosRemoteIsoUrl = `https://github.com/siderolabs/talos/releases/download/${talosVersion}/talos-amd64.iso`;
const talosLocalIsoFilename = path.join(
  __dirname,
  `../assets/talos-amd64-${talosVersion}.iso`
);
download(talosLocalIsoFilename, talosRemoteIsoUrl);

const sopsFile = path.join(__dirname, '../secrets/secrets.sops.yaml');
const tfeOrg = 'MsHomeLab';

const presetTalosVM = {
  args: '-cpu kvm64,+cx16,+lahf_lm,+popcnt,+sse3,+ssse3,+sse4.1,+sse4.2',
  iso: 'local:iso/talos-amd64-v1.2.3.iso',
  boot: 'order=scsi0;ide2',
  pause: '30s',
};
const kubeConfigSideroMetal = path.join(
  __dirname,
  '../kubeconfig/stage-talos-cluster'
);

/**
 * Prepare RemoteBackends
 */

const stackRemoteBackendHandler = new RemoteBackendHandlerStack(
  app,
  'RemoteBackendHandlerStack',
  {
    remoteBackendOrganization: tfeOrg,
    sopsSecretsFile: sopsFile,
  }
);

/**
 * Prepare Network
 */

const stackUnifiNetworkSetup = new UnifiNetworkSetupStack(
  app,
  'UnifiNetworkSetupStack',
  {
    remoteBackendOrganization: tfeOrg,
    remoteBackendHandlerStack: stackRemoteBackendHandler,
    sopsSecretsFile: sopsFile,
  }
);

const unifiNetworkHomelab = stackUnifiNetworkSetup.addNetwork({
  name: 'HomeLab',
  purpose: 'corporate',
  vlanId: 100,
  dhcpEnabled: true,
  dhcpStart: '192.168.100.100',
  dhcpStop: '192.168.100.200',
  dhcpdBootEnabled: true,
  dhcpdBootServer: '192.168.100.100',
  dhcpdBootFilename: 'undionly.kpxe',
  dhcpDns: ['192.168.1.10'],
  internetAccessEnabled: true,
  subnet: '192.168.100.1/24',
});

/**
 * Prepare StageTalosCluster
 */

const stackStageTalosClusterVm = new ProxmoxVmStack(
  app,
  'StageTalosClusterVmStack',
  {
    remoteBackendOrganization: tfeOrg,
    remoteBackendHandlerStack: stackRemoteBackendHandler,
    sopsSecretsFile: sopsFile,
  }
);

const stageTalosClusterVMs = [100, 101, 102].map((num): VirtualMachine => {
  return stackStageTalosClusterVm.addVirtualMachine({
    name: `stage-cluster-${num}`,
    vmid: num,
    cores: 2,
    memory: 4,
    storage: 10,
    fixedIp: `192.168.100.${num}`,
    unifiNetwork: unifiNetworkHomelab,
    ...presetTalosVM,
  });
});

/**
 * Bootstrap Configure and Bootstrap Sidero Talos Cluster
 */

const stackStageTalosCluster = new TalosClusterStack(
  app,
  'StageTalosClusterStack',
  {
    remoteBackendOrganization: tfeOrg,
    remoteBackendHandlerStack: stackRemoteBackendHandler,
    sopsSecretsFile: sopsFile,
    clusterName: 'cluster-stage',
    clusterEndpoint: 'cluster-stage.lab.familie-siebert.de',
    vipIp: '192.168.100.10',
    dependsOn: [stackStageTalosClusterVm],
  }
);

const stageTalosClusterNodes = stageTalosClusterVMs.map(vm =>
  stackStageTalosCluster.addControlPlaneNode(vm.name, vm.fixedIp)
);

stageTalosClusterNodes.forEach( (node, index) => node.saveKubeConfig(`${kubeConfigSideroMetal}-${100+index}`));
app.synth();
