docker run -i --rm quay.io/coreos/fcct:release --pretty --strict < config.fcc > config.ign

pvesh create /nodes/proxmox/qemu/100/config/ --args "-fw_cfg name=opt/com.coreos/config,file=root/ignition.ign"