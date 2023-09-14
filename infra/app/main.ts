import { App } from 'cdktf';
import { RemoteBackendHandlerStack } from '../constructs/CustomStack';
import { UnifiNetworkSetupStack } from '../stacks/UnifiNetworkSetupStack';

import { ProxmoxVmStack } from '../stacks/ProxmoxVmStack';
import { TalosClusterStack } from '../stacks/TalosClusterStack';
//import { AdguardStack } from '../stacks/AdguardStack';
import * as path from 'path';
import { FluxCdPrepareStack, FluxCdStack } from '../stacks/FluxCdStack';

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
  dhcpDns: ['192.168.1.10'],
  dhcpV6Start: '::2',
  dhcpV6Stop: '::7d1',
  ipv6PdStart: '::2',
  ipv6PdStop: '::7d1',
  ipv6RaPriority: 'high',
  internetAccessEnabled: true,
  subnet: '192.168.10.1/24',
});

interface ProxmoxHost {
  name: string;
  mac: string;
  ip: string;
}

const talosVms:ProxmoxHost[] = []

const pveNodes:ProxmoxHost[] = 
[
  {
    name: 'pve',
    mac: '1c:83:4f:ff:fc:c2',
    ip: '192.168.10.10',
  },
  ...talosVms  
]

pveNodes.forEach( (host) => {
  unifiNetworkHomelab.addClient({
    mac: host.mac,
    name: host.name,
    fixedIp: host.ip,
  })
});

/**
 * Prepare DNS
 */

//const stackAdguard = new AdguardStack(app, 'Adguard', {
//  remoteBackendHandlerStack,
//});

//stackAdguard.addRule(
//  '! Bild.de',
//  '@@||www.asadcdn.com^',
//  '@@||code.bildstatic.de^',
//  '@@||de.ioam.de^',
//  '@@||json.bild.de^',
//  '@@||script.ioam.de^',
//  '@@||tags.tiqcdn.com^',
//  '@@||tagger.opecloud.com^',
//  '! Talos Stage',
//  '||talos-stage-vip.lab.familie-siebert.de^$dnsrewrite=NOERROR;A;192.168.10.20',
//  '||talos-stage.lab.familie-siebert.de^$dnsrewrite=NOERROR;A;192.168.10.21',
//  '||talos-stage.lab.familie-siebert.de^$dnsrewrite=NOERROR;A;192.168.10.22',
//  '||talos-stage.lab.familie-siebert.de^$dnsrewrite=NOERROR;A;192.168.10.23',
//);

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
//stackTalosStageCluster.addDependency(stackAdguard);
stackTalosStageCluster.saveTalosConfig(path.join(__dirname, '../../connect/talosconfig/talos-stage'));
stackTalosStageCluster.addControlPlaneNode(talosVM.name, talosVM.fixedIp).saveKubeConfig(path.join(__dirname, `../../connect/kubeconfig/talos-kubeconfig`));;

const fluxPrepare = new FluxCdPrepareStack(app, 'TalosFluxCdPrepare', {
  environment: 'main',
  githubRepoName: 'lab',
  remoteBackendHandlerStack,
})
fluxPrepare.addDependency(stackTalosStageCluster);

new FluxCdStack(app, 'TalosFluxCd', {
  environment: 'main',
  githubBranch: 'main',
  githubRepoOwner: 'markussiebert',
  githubRepoName: 'lab',
  githubTargetPath: 'flux/main',
  tlsPrivateKey: fluxPrepare.tlsPrivateKey,
  kubeconfigPath: path.join(__dirname, `../../connect/kubeconfig/talos-kubeconfig`),
  remoteBackendHandlerStack,
}).addDependency(fluxPrepare)

app.synth();
