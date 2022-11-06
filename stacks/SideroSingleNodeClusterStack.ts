import { Construct } from 'constructs';
import { TerraformOutput } from 'cdktf';
import * as proxmox from '../.gen/providers/proxmox';
import * as unifi from '../.gen/providers/unifi';
import * as local from '../.gen/providers/local';
import path = require('path');
import { ProxmoxTalosVirtualMachine } from '../constructs/ProxmoxTalosVM';
import { TalosCluster } from '../constructs/TalosCluster';
import { RemoteBackendStack } from '../constructs/RemoteBackendStack';
import { LocalExec } from '../constructs/LocalExec';
import { sleep } from '../.gen/providers/time';

export class SideroSingleNodeClusterStack extends RemoteBackendStack {
  constructor(scope: Construct, name: string) {
    super(scope, name, {
      remoteBackend: 'markussiebert/lab-sidero',
      sopsSecretsFile: path.join(__dirname, '../secrets/secrets.sops.yaml'),
    });

    /**
     * Proxmox Provider
     */

    new proxmox.provider.ProxmoxProvider(this, 'ProviderProxmox', {
      pmApiUrl: this.getSopsSecretValue('provider.proxmox.url'),
      pmUser: this.getSopsSecretValue('provider.proxmox.username'),
      pmPassword: this.getSopsSecretValue('provider.proxmox.password'),
    });

    /**
     * Unifi Provider
     */

    new unifi.provider.UnifiProvider(this, 'UnifiProvider', {
      apiUrl: this.getSopsSecretValue('provider.unifi.url'),
      username: this.getSopsSecretValue('provider.unifi.username'),
      password: this.getSopsSecretValue('provider.unifi.password'),
    });

    const unifiUserSidero = new unifi.user.User(this, 'SideroUnifiUser', {
      mac: generateMac('sidero'),
      name: 'sidero',
      fixedIp: '192.168.100.100',
      networkId: '6367f7463a35b0104f059d5b',
    })

    /**
     * Local Provider
     */
    new local.provider.LocalProvider(this, 'LocalProvider');

    const sideroVm = new ProxmoxTalosVirtualMachine(
      this,
      'SideroVirtualMachine',
      {
        name: 'sidero',
        cores: 2,
        memory: 4,
        vlanTag: 100,
        vmid: 100,
        boot: 'order=scsi0;ide2',
        storage: 10,
        pause: '30s',
        macAddress: generateMac('sidero'),
        dependsOn: [unifiUserSidero]
      }
    );

    const sideroTalosCluster = new TalosCluster(this, 'SideroTalosCluster', {
      clusterEndpoint: '192.168.100.100',
      dependsOn: [sideroVm],
    });

    const sideroTalosClusterSingleNode = sideroTalosCluster.addControlPlaneNode(
      'SideroSingleNode',
      '192.168.100.100',
      'sidero'
    );
    sideroTalosCluster.bootStrap(sideroTalosClusterSingleNode);
    const sideroTalosClusterKubeConfig = sideroTalosCluster.getKubeConfig(
      sideroTalosClusterSingleNode
    );

    new TerraformOutput(this, 'Sidero.VirtualMachine.MacAddress', {
      value: sideroVm.getMacAddress(),
    });

    new TerraformOutput(this, 'Sidero.VirtualMachine.IpAddress', {
      value: '192.168.100.100',
    });

    new TerraformOutput(this, 'Sidero.Cluster.KubeConfig', {
      value: sideroTalosClusterKubeConfig,
      sensitive: true,
    });

    const kubeconfig = new local.sensitiveFile.SensitiveFile(
      this,
      'SideroTalosSingleNodeClusterKubeConfig',
      {
        filename: path.join(__dirname, '../kubeconfig/sidero-single-node'),
        content: sideroTalosClusterKubeConfig,
      }
    );

    const sleepBeforeInstallingSidero = new sleep.Sleep(this, 'Pause', {
      createDuration: '3m',
      dependsOn: [kubeconfig],
    });

    const clusterCtl = new LocalExec(this, 'test', {
      command: `clusterctl init -b talos -c talos -i sidero --kubeconfig  ${kubeconfig.filename}`,
      environment: {
        SIDERO_CONTROLLER_MANAGER_HOST_NETWORK: 'true',
        SIDERO_CONTROLLER_MANAGER_API_ENDPOINT: '192.168.100.100',
        SIDERO_CONTROLLER_MANAGER_SIDEROLINK_ENDPOINT: '192.168.100.100',
      },
      dependsOn: [sleepBeforeInstallingSidero],
    });

    new ProxmoxTalosVirtualMachine(
      this,
      'Node1',
      {
        name: 'node1',
        cores: 2,
        memory: 4,
        vlanTag: 100,
        vmid: 110,
        boot: 'order=scsi0;net0',
        storage: 10,
        macAddress: generateMac('node1'),
        dependsOn: [clusterCtl]
      }
    );

    new ProxmoxTalosVirtualMachine(
      this,
      'Node2',
      {
        name: 'node2',
        cores: 2,
        memory: 4,
        vlanTag: 100,
        vmid: 112,
        boot: 'order=scsi0;net0',
        storage: 10,
        macAddress: generateMac('node2'),
        dependsOn: [clusterCtl]
      }
    );

    new ProxmoxTalosVirtualMachine(
      this,
      'Node3',
      {
        name: 'node3',
        cores: 2,
        memory: 4,
        vlanTag: 100,
        vmid: 113,
        boot: 'order=scsi0;net0',
        storage: 10,
        macAddress: generateMac('node3'),
        dependsOn: [clusterCtl]
      }
    );
  }
}

function generateMac(input: string): string {

  // from https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
  for( var i=0,h=9;i<input.length;) {
      h=Math.imul(h^input.charCodeAt(i++),9**9);
  }
  
  return `aaaa${ ((h^h>>>9) < 0 ? (h^h>>>9) * -1 : (h^h>>>9)).toString(16) }`.toUpperCase().match(/.{1,2}/g)!.join(':');
}
