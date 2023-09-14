import { Construct } from 'constructs';
import {
  RemoteBackendStackProps,
  RemoteBackendStack,
} from '../constructs/CustomStack';
import { ITerraformDependable, Lazy } from 'cdktf';
import * as talos from '../.gen/providers/talos';
import * as time from '../.gen/providers/time';
import * as local from '../.gen/providers/local';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface TalosClusterStackProps extends RemoteBackendStackProps {
  /**
   * The hostname/ip this cluster will be reachable
   *
   * The result will look like: https://${clusterEndpoint}:6443
   */
  //readonly clusterEndpoint: string;
  readonly clusterName: string;
  readonly vipIp: string;
}

export class TalosClusterStack extends RemoteBackendStack {

  public readonly machineSecrets: talos.machineSecrets.MachineSecrets;
  public readonly talosConfig: talos.dataTalosClientConfiguration.DataTalosClientConfiguration;
  public readonly clusterEndpoint: string;
  public readonly clusterFqdn: string;
  public readonly clusterName: string;
  public readonly machineConfigurationControlPlane: talos.dataTalosMachineConfiguration.DataTalosMachineConfiguration;
  public readonly machineConfigurationWorker: talos.dataTalosMachineConfiguration.DataTalosMachineConfiguration;
  public readonly bootStrap:talos.machineBootstrap.MachineBootstrap;
  public readonly vipIp:string;
  public readonly nodes:TalosNode[] = [];
  public readonly endpoints: string[] = [];

  constructor(scope: Construct, name: string, props: TalosClusterStackProps) {
    super(scope, name, props);

    new talos.provider.TalosProvider(this, 'TalosProvider');
    new time.provider.TimeProvider(this, 'ProviderTime4Pause');
    new local.provider.LocalProvider(this, 'LocalProvider');

    this.clusterName = props.clusterName;
    this.clusterFqdn = props.vipIp;
    this.clusterEndpoint = `https://${this.clusterFqdn}:6443`;
    this.vipIp = props.vipIp;

    this.machineSecrets = new talos.machineSecrets.MachineSecrets(
      this,
      'MachineSecrets'
    );

    this.talosConfig = new talos.dataTalosClientConfiguration.DataTalosClientConfiguration(
      this,
      'ClientConfiguration',
      {
        clusterName: this.clusterName,
        endpoints: Lazy.listValue({
          produce: () => this.endpoints
        }),
        clientConfiguration: this.machineSecrets.clientConfiguration,
      }
    );

    this.machineConfigurationControlPlane =
      new talos.dataTalosMachineConfiguration.DataTalosMachineConfiguration(
        this,
        'MachineConfigurationControlplane',
        {
          clusterEndpoint: this.clusterEndpoint,
          clusterName: this.clusterName,
          machineType: 'controlplane',
          machineSecrets: this.machineSecrets.machineSecrets,
        }
      );

    this.machineConfigurationWorker =
    new talos.dataTalosMachineConfiguration.DataTalosMachineConfiguration(
      this,
      'MachineConfigurationWorker',
      {
        clusterEndpoint: this.clusterEndpoint,
        clusterName: this.clusterName,
        machineType: 'worker',
        machineSecrets: this.machineSecrets.machineSecrets,
      }
    );
    
    this.bootStrap = new talos.machineBootstrap.MachineBootstrap(
      this,
      'MachineBootstrap',
      {
        clientConfiguration: this.talosConfig.clientConfiguration,
        endpoint: Lazy.stringValue( { produce: () => this.nodes[0].appliedMachineConfiguration.endpoint }),
        nodeAttribute: Lazy.stringValue( { produce: () => this.nodes[0].appliedMachineConfiguration.nodeAttribute }),
        lifecycle: {
          ignoreChanges: "all",
        }
      }
    );
    
    new time.sleep.Sleep(this, `MachineBootstrapSleep`, {
      createDuration: '3m',
      dependsOn: [this.bootStrap],
    });
  }

  public addControlPlaneNode(name: string, endpoint: string): TalosNode {

    this.endpoints.push(endpoint);
    execFileSync('./create-cilium-yaml.sh', [this.vipIp], {
      cwd: path.join(__dirname, '../hack/cilium/'),
      shell: true,
    });
    const ciliumInlineManifest = fs.readFileSync(path.join(__dirname, '../hack/cilium/final-cilium-manifest.yaml'))
      .toString()
      .split('\n')
      // remove all comment lines, empty lines
      .filter( (line) => (line.includes("# ") != true))
      .filter( (line) => (line.charAt(line.length) != "#"))
      .filter( (line) => (line != ""))
      // indent and replace special characters
     .map( (line) =>  `      ${line.split('${').join('$${')}`);

    const node = new TalosNode(this, `ControlPlaneNode-${name}`, 'ControlPlane',  {
      endpoint: endpoint,
      clientConfiguration: this.talosConfig.clientConfiguration,
      machineConfigurationInput: this.machineConfigurationControlPlane.machineConfiguration,
      configPatches: [
        [
          'cluster:',
          '  inlineManifests:',
          '  - name: clilium',
          '    contents: |-',
          // Prepare cilium inline manifest
          ...ciliumInlineManifest,
          'machine:',
          '  install:',
          '    disk: /dev/sda',
          '  network:',
          `    hostname: ${name}`,
          `    interfaces:`,
          `    - interface: eth0`,
          `      dhcp: true`,
          //`      vip:`,
          //`        ip: ${this.vipIp}`,
        ].join('\n'),
        JSON.stringify([
          {
            op: 'add',
            path: '/cluster/allowSchedulingOnControlPlanes',
            value: true,
          },
          /**
           * Prepare for OpenEBS JIVA
           * https://www.talos.dev/v1.2/kubernetes-guides/configuration/replicated-local-storage-with-openebs-jiva/
           */
          //{
          //  op: 'add',
          //  path: '/machine/install/extensions',
          //  value: [
          //    { 
          //      image: 'ghcr.io/siderolabs/iscsi-tools:v0.1.1' 
          //    }
          //  ]
          //},
          //{
          //  op: 'add',
          //  path: '/machine/kubelet/extraMounts',
          //  value: [
          //    {
          //      destination: '/var/openebs/local',
          //      type: 'bind',
          //      source: '/var/openebs/local',
          //      options: [
          //        'bind',
          //        'rshared',
          //        'rw'
          //      ]
          //    }
          //  ]
          //},
          /**
           * Switching to cilium
           */
          {
            op: 'add',
            path: '/cluster/network/cni',
            value: {
              name: 'none',
            }
          },
          {
            op: 'add',
            path: '/cluster/proxy',
            value: {
              disabled: true,
            }
          },
          {
            op: 'add',
            path: '/machine/features/kubePrism',
            value: {
              enabled: true,
              port: 7445,
            }
          },
        ]),
      ],
      nodeAttribute: endpoint,
    });
    if (this.nodes.length > 0) {
      node.node.addDependency(this.nodes[this.nodes.length-1].node);
    }
    this.nodes.push(node);
    return node;
  }

  public saveTalosConfig(filename: string) {
    new local.sensitiveFile.SensitiveFile(
      this,
      'TalosConfig',
      {
        filename,

        content: this.talosConfig.talosConfig,
      }
    );
  }
}

export class TalosNode extends Construct implements ITerraformDependable {
  readonly appliedMachineConfiguration: talos.machineConfigurationApply.MachineConfigurationApply;
  readonly fqn: string;
  readonly clientConfiguration: talos.machineConfigurationApply.MachineConfigurationApplyClientConfiguration;
  constructor(
    scope: Construct,
    name: string,
    public readonly type: 'Worker' | 'ControlPlane',
    config: talos.machineConfigurationApply.MachineConfigurationApplyConfig,
  ) {
    super(scope, name);
    this.clientConfiguration = config.clientConfiguration;
    this.appliedMachineConfiguration =
      new talos.machineConfigurationApply.MachineConfigurationApply(
        this,
        `MachineConfiguration`,
        config
      );
    this.fqn = this.appliedMachineConfiguration.fqn;
  }

  public getKubeConfig(): string {
    return new talos.dataTalosClusterKubeconfig.DataTalosClusterKubeconfig(this, `KubeConfigData`, {
      clientConfiguration: this.clientConfiguration,
      endpoint: this.appliedMachineConfiguration.endpoint,
      nodeAttribute: this.appliedMachineConfiguration.nodeAttribute
    }).kubeconfigRaw;
  }

  public saveKubeConfig(filename: string) {
    new local.sensitiveFile.SensitiveFile(
      this,
      `KubeConfigSave`,
      {
        filename,
        content: this.getKubeConfig(),
      }
    );
  }
}
