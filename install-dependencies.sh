#!/bin/bash
# Script de Instalación de Dependencias para Wi-Fi Roaming Analyzer
# 
# Detecta la distribución Linux y instala las herramientas necesarias
# Uso: sudo ./install-dependencies.sh

set -e  # Exit on error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Wi-Fi Roaming Analyzer - Instalador${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Verificar si se ejecuta como root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ Este script debe ejecutarse como root (sudo)${NC}"
   exit 1
fi

# Detectar distribución
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    ID=$ID
else
    echo -e "${RED}❌ No se puede detectar la distribución${NC}"
    exit 1
fi

echo -e "${BLUE}Distribución detectada: ${GREEN}$OS${NC}"
echo ""

# Arrays de paquetes
declare -a REQUIRED_PACKAGES=("iw" "iproute2" "iputils-ping")
declare -a OPTIONAL_PACKAGES=("network-manager" "wireless-tools")

# Función de instalación para Debian/Ubuntu
install_debian() {
    echo -e "${YELLOW}📦 Actualizando lista de paquetes...${NC}"
    apt-get update
    
    echo -e "${YELLOW}📦 Instalando dependencias requeridas...${NC}"
    for pkg in "${REQUIRED_PACKAGES[@]}"; do
        if apt-get install -y "$pkg"; then
            echo -e "${GREEN}✅ $pkg instalado${NC}"
        else
            echo -e "${RED}⚠️  Error instalando $pkg${NC}"
        fi
    done
    
    echo -e "${YELLOW}📦 Instalando dependencias opcionales (recomendadas)...${NC}"
    for pkg in "${OPTIONAL_PACKAGES[@]}"; do
        if apt-get install -y "$pkg"; then
            echo -e "${GREEN}✅ $pkg instalado${NC}"
        else
            echo -e "${YELLOW}⚠️  $pkg no disponible o no se pudo instalar${NC}"
        fi
    done
}

# Función de instalación para Fedora/RHEL
install_fedora() {
    echo -e "${YELLOW}📦 Instalando dependencias requeridas...${NC}"
    dnf install -y iw iproute iputils || true
    
    echo -e "${YELLOW}📦 Instalando dependencias opcionales...${NC}"
    dnf install -y NetworkManager wireless-tools || true
}

# Función de instalación para Arch
install_arch() {
    echo -e "${YELLOW}📦 Sincronizando base de datos de paquetes...${NC}"
    pacman -Sy
    
    echo -e "${YELLOW}📦 Instalando dependencias...${NC}"
    pacman -S --noconfirm iw iproute2 iputils networkmanager wireless_tools || true
}

# Ejecutar instalación según distribución
case "$ID" in
    ubuntu|debian)
        install_debian
        ;;
    fedora|rhel|centos)
        install_fedora
        ;;
    arch|manjaro)
        install_arch
        ;;
    *)
        echo -e "${RED}❌ Distribución no soportada: $ID${NC}"
        echo ""
        echo -e "${YELLOW}Por favor, instala manualmente:${NC}"
        echo "  - iw"
        echo "  - iproute2"
        echo "  - iputils-ping"
        echo "  - network-manager (opcional pero recomendado)"
        exit 1
        ;;
esac

# Verificación final
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verificando instalación...${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

verify_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✅ $1${NC}"
        return 0
    else
        echo -e "${RED}❌ $1 ${YELLOW}(no encontrado)${NC}"
        return 1
    fi
}

ALL_OK=true
verify_command "iw" || ALL_OK=false
verify_command "ip" || ALL_OK=false
verify_command "ping" || ALL_OK=false
verify_command "nmcli" || true  # Opcional

echo ""
if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}✅ Todas las dependencias requeridas están instaladas!${NC}"
    echo ""
    echo -e "${BLUE}Puedes iniciar el servidor con:${NC}"
    echo -e "  ${YELLOW}./run.sh${NC}"
    echo -e "  ${YELLOW}./run.sh -i wlan0${NC}"
    echo -e "  ${YELLOW}./run.sh --list${NC}"
else
    echo -e "${YELLOW}⚠️  Algunas dependencias requeridas no se encontraron${NC}"
    echo -e "${YELLOW}Por favor, instálalas manualmente según el archivo requirements-system.txt${NC}"
fi

echo ""
