helm template cilium cilium/cilium \
    --version '1.14.1' \
    --namespace kube-system \
    --set ipam.mode=kubernetes \
    --set kubeProxyReplacement=strict \
    --set k8sServiceHost=$1 \
    --set hubble.relay.enabled=false \
    --set hubble.ui.enabled=false \
    --set securityContext.capabilities.ciliumAgent="{CHOWN,KILL,NET_ADMIN,NET_RAW,IPC_LOCK,SYS_ADMIN,SYS_RESOURCE,DAC_OVERRIDE,FOWNER,SETGID,SETUID}" \
    --set securityContext.capabilities.cleanCiliumState="{NET_ADMIN,SYS_ADMIN,SYS_RESOURCE}" \
    --set cgroup.autoMount.enabled=false \
    --set cgroup.hostRoot=/sys/fs/cgroup \
    --set operator.replicas=1 \
    --set k8sServicePort='6443' > cilium-manifest.yaml
    
  
kustomize build -o temp-cilium-manifest.yaml
# https://github.com/kubernetes-sigs/kustomize/issues/947
cat temp-cilium-manifest.yaml | yq > final-cilium-manifest.yaml