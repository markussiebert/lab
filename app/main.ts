import { Construct } from 'constructs';
import { App, TerraformOutput } from 'cdktf';
import * as proxmox from '../.gen/providers/proxmox';
import * as unifi from '../.gen/providers/unifi';
import * as local from '../.gen/providers/local';
import path = require('path');
import { ProxmoxTalosVirtualMachine } from '../constructs/ProxmoxTalosVM';
import { TalosCluster } from '../constructs/TalosCluster';
import { RemoteBackendStack } from '../constructs/RemoteBackendStack';

class SideroSingleNodeClusterStack extends RemoteBackendStack {
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
        storage: 10,
        pause: '3m',
      }
    );

    const sideroVmUnifiUserData = new unifi.dataUnifiUser.DataUnifiUser(
      this,
      'SideroVirtualMachineUnifiUserData',
      {
        mac: sideroVm.getMacAddress(),
        dependsOn: [sideroVm],
      }
    );

    const sideroTalosCluster = new TalosCluster(this, 'SideroTalosCluster', {
      clusterEndpoint: sideroVmUnifiUserData.ip,
    });

    const sideroTalosClusterSingleNode = sideroTalosCluster.addControlPlaneNode(
      'SideroSingleNode',
      sideroVmUnifiUserData.ip,
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
      value: sideroVmUnifiUserData.ip,
    });

    new TerraformOutput(this, 'Sidero.Cluster.KubeConfig', {
      value: sideroTalosClusterKubeConfig,
      sensitive: true,
    });

    new local.sensitiveFile.SensitiveFile(
      this,
      'SideroTalosSingleNodeClusterKubeConfig',
      {
        filename: path.join(__dirname, '../kubeconfig/sidero-single-node'),
        content: sideroTalosClusterKubeConfig,
      }
    );
  }
}

const app = new App();
new SideroSingleNodeClusterStack(app, 'SideroVM');
app.synth();
