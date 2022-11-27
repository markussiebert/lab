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
import path = require('path');
export interface TalosClusterStackProps extends RemoteBackendStackProps {
  /**
   * The hostname/ip this cluster will be reachable
   *
   * The result will look like: https://${clusterEndpoint}:6443
   */
  readonly clusterEndpoint: string;
  readonly clusterName: string;
  readonly vipIp: string;
}

export class TalosClusterStack extends RemoteBackendStack {

  public readonly machineSecrets: string;
  public readonly talosConfig: string;
  public readonly clusterEndpoint: string;
  public readonly clusterName: string;
  public readonly machineConfigurationControlPlane: string;
  public readonly machineConfigurationWorker: string;
  public readonly bootStrap:talos.machineBootstrap.MachineBootstrap;
  public readonly vipIp:string;
  public readonly nodes:TalosNode[];

  constructor(scope: Construct, name: string, props: TalosClusterStackProps) {
    super(scope, name, props);

    new talos.provider.TalosProvider(this, 'TalosProvider');
    new time.provider.TimeProvider(this, 'ProviderTime4Pause');
    new local.provider.LocalProvider(this, 'LocalProvider');

    this.clusterName = props.clusterName;
    this.clusterEndpoint = `https://${props.clusterEndpoint}:6443`;
    this.vipIp = props.vipIp;

    this.machineSecrets = new talos.machineSecrets.MachineSecrets(
      this,
      'MachineSecrets'
    ).machineSecrets;

    this.talosConfig = new talos.clientConfiguration.ClientConfiguration(
      this,
      'ClientConfiguration',
      {
        clusterName: this.clusterName,
        machineSecrets: this.machineSecrets,
      }
    ).talosConfig;

    this.machineConfigurationControlPlane =
      new talos.machineConfigurationControlplane.MachineConfigurationControlplane(
        this,
        'MachineConfigurationControlplane',
        {
          clusterEndpoint: this.clusterEndpoint,
          clusterName: this.clusterName,
          machineSecrets: this.machineSecrets,
        }
      ).machineConfig;

    this.machineConfigurationWorker =
      new talos.machineConfigurationWorker.MachineConfigurationWorker(
        this,
        'MachineConfigurationWorker',
        {
          clusterEndpoint: this.clusterEndpoint,
          clusterName: this.clusterName,
          machineSecrets: this.machineSecrets,
        }
      ).machineConfig;
    
    this.nodes = [];

    this.bootStrap = new talos.machineBootstrap.MachineBootstrap(
      this,
      'MachineBootstrap',
      {
        talosConfig: this.talosConfig,
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

    const ciliumInlineManifest = fs.readFileSync(path.join(__dirname, '../config/cilium/final-cilium-manifest.yaml'))
      .toString()
      .split('\n')
      // remove all comment lines, empty lines
      .filter( (line) => (line.includes("# ") != true))
      .filter( (line) => (line.charAt(line.length) != "#"))
      .filter( (line) => (line != ""))
      // indent and replace special characters
     .map( (line) =>  `      ${line.split('${').join('$${')}`);

    const node = new TalosNode(this, `ControlPlaneNode-${name}`, 'ControlPlane', {
      endpoint: endpoint,
      machineConfiguration: this.machineConfigurationControlPlane,
      talosConfig: this.talosConfig,
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
          `      vip:`,
          `        ip: ${this.vipIp}`,
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
          {
            op: 'add',
            path: '/machine/install/extensions',
            value: [
              { 
                image: 'ghcr.io/siderolabs/iscsi-tools:v0.1.1' 
              }
            ]
          },
          {
            op: 'add',
            path: '/machine/kubelet/extraMounts',
            value: [
              {
                destination: '/var/openebs/local',
                type: 'bind',
                source: '/var/openebs/local',
                options: [
                  'bind',
                  'rshared',
                  'rw'
                ]
              }
            ]
          },
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
        ]),
      ],
      nodeAttribute: endpoint,
    });
    this.nodes.push(node);
    return node;
  }

  public saveTalosConfig(filename: string) {
    new local.sensitiveFile.SensitiveFile(
      this,
      'TalosConfig',
      {
        filename,
        content: this.talosConfig,
      }
    );
  }
}

export class TalosNode extends Construct implements ITerraformDependable {
  readonly type: 'Worker' | 'ControlPlane';
  readonly appliedMachineConfiguration: talos.machineConfigurationApply.MachineConfigurationApply;
  fqn: string;

  constructor(
    scope: Construct,
    name: string,
    type: 'Worker' | 'ControlPlane',
    config: talos.machineConfigurationApply.MachineConfigurationApplyConfig
  ) {
    super(scope, name);
    (this.type = type),
      (this.appliedMachineConfiguration =
        new talos.machineConfigurationApply.MachineConfigurationApply(
          this,
          `MachineConfiguration`,
          config
        ));
    this.fqn = this.appliedMachineConfiguration.fqn;
  }

  public getKubeConfig(): string {
    return new talos.clusterKubeconfig.ClusterKubeconfig(this, 'KubeConfig', {
      talosConfig: this.appliedMachineConfiguration.talosConfig,
      endpoint: this.appliedMachineConfiguration.endpoint,
      nodeAttribute: this.appliedMachineConfiguration.nodeAttribute,
    }).kubeConfig;
  }

  public saveKubeConfig(filename: string) {
    new local.sensitiveFile.SensitiveFile(
      this,
      'SideroTalosSingleNodeClusterKubeConfig',
      {
        filename,
        content: this.getKubeConfig(),
      }
    );
  }
}
