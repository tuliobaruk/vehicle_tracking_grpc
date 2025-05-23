#!/bin/bash

# Cores para saída no terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Função para exibir título
show_title() {
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                  SISTEMA DE RASTREAMENTO VEICULAR                ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Função para diagnosticar problemas de conexão
diagnose_services() {
    echo -e "${BLUE}=== DIAGNÓSTICO DE SERVIÇOS ===${NC}"
    
    # Verificar se os serviços estão rodando
    echo -e "${CYAN}Verificando serviços:${NC}"
    docker-compose ps
    
    # Obter informações da rede
    echo -e "\n${CYAN}Informações da rede:${NC}"
    NETWORK_NAME=$(docker network ls --filter name=_tracking_network --format "{{.Name}}" | head -n1)
    
    if [ -z "$NETWORK_NAME" ]; then
        echo -e "${RED}Rede Docker não encontrada. Verifique se a infraestrutura está rodando.${NC}"
    else
        echo -e "Rede Docker: ${GREEN}$NETWORK_NAME${NC}"
        
        # Verificar IPs dos serviços
        echo -e "\n${CYAN}IPs dos serviços:${NC}"
        docker network inspect $NETWORK_NAME | grep -A 3 "\"Name\": \"central-tracking-service\""
        docker network inspect $NETWORK_NAME | grep -A 3 "\"Name\": \"eta-service\""
        
        # Testar conectividade
        echo -e "\n${CYAN}Testando conectividade:${NC}"
        echo -e "central-tracking-service porta 50051:"
        CENTRAL_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' central-tracking-service)
        if [ -n "$CENTRAL_IP" ]; then
            docker run --rm --network $NETWORK_NAME alpine sh -c "apk add --no-cache curl && curl -s telnet://$CENTRAL_IP:50051 || echo 'Porta fechada'"
        else
            echo -e "${RED}IP do central-tracking-service não encontrado${NC}"
        fi
        
        # Verificar logs
        echo -e "\n${CYAN}Últimas linhas dos logs:${NC}"
        docker-compose logs --tail=10 central-tracking-service
    fi
    
    echo -e "\n${CYAN}Recomendações:${NC}"
    echo -e "1. Verifique se o central-tracking-service está rodando"
    echo -e "2. Verifique se as portas estão expostas corretamente"
    echo -e "3. Verifique os logs para identificar possíveis erros"
    echo -e "4. Tente reiniciar a infraestrutura (opção 3 seguida de opção 1)"
    
    read -p "Pressione Enter para continuar..."
}

# Função para exibir o menu
show_menu() {
    clear
    show_title
    echo -e "${BLUE}SISTEMA DE GERENCIAMENTO${NC}"
    echo -e "${CYAN}1.${NC} Iniciar infraestrutura (Postgres, Services, Frontend)"
    echo -e "${CYAN}2.${NC} Verificar status dos serviços"
    echo -e "${CYAN}3.${NC} Parar todos os serviços"
    echo -e "${CYAN}4.${NC} Ver logs de um serviço"
    echo ""
    echo -e "${BLUE}VEÍCULOS${NC}"
    echo -e "${CYAN}5.${NC} Iniciar um veículo (cliente GPX)"
    echo -e "${CYAN}6.${NC} Verificar veículos em execução"
    echo -e "${CYAN}7.${NC} Parar um veículo específico"
    echo ""
    echo -e "${BLUE}CALCULADORA ETA${NC}"
    echo -e "${CYAN}8.${NC} Iniciar cliente ETA interativo"
    echo ""
    echo -e "${BLUE}FERRAMENTAS${NC}"
    echo -e "${CYAN}9.${NC} Limpar dados (reiniciar completamente)"
    echo -e "${CYAN}10.${NC} Diagnosticar problemas de conexão"
    echo -e "${CYAN}0.${NC} Sair"
    echo ""
    echo -e "${YELLOW}Escolha uma opção:${NC} "
}

# Função para iniciar a infraestrutura
start_infrastructure() {
    echo -e "${GREEN}Iniciando infraestrutura...${NC}"
    
    # Iniciar PostgreSQL primeiro e aguardar estar saudável
    echo -e "${YELLOW}Iniciando PostgreSQL...${NC}"
    docker-compose up -d postgres
    
    # Esperar PostgreSQL ficar pronto
    echo -e "${YELLOW}Aguardando PostgreSQL estar pronto...${NC}"
    timeout=60
    counter=0
    until docker-compose exec postgres pg_isready -U postgres > /dev/null 2>&1 || [ $counter -eq $timeout ]; do
        echo -n "."
        sleep 1
        counter=$((counter+1))
    done
    
    if [ $counter -eq $timeout ]; then
        echo -e "\n${RED}Timeout esperando pelo PostgreSQL.${NC}"
        return 1
    fi
    
    echo -e "\n${GREEN}PostgreSQL está pronto!${NC}"
    
    # Iniciar central-tracking-service
    echo -e "${YELLOW}Iniciando central-tracking-service...${NC}"
    docker-compose up -d central-tracking-service
    
    # Esperar pelo central-tracking-service
    echo -e "${YELLOW}Aguardando central-tracking-service inicializar...${NC}"
    sleep 15
    
    # Verificar se o serviço está rodando
    if ! docker-compose ps central-tracking-service | grep "Up" > /dev/null; then
        echo -e "${RED}central-tracking-service não iniciou corretamente.${NC}"
        echo -e "${YELLOW}Verificando logs:${NC}"
        docker-compose logs --tail=20 central-tracking-service
        return 1
    fi
    
    echo -e "${GREEN}central-tracking-service está rodando!${NC}"
    
    # Iniciar os demais serviços
    echo -e "${YELLOW}Iniciando serviços restantes...${NC}"
    docker-compose up -d eta-service express-grpc-gateway frontend vehicle-client eta-client
    
    echo -e "${YELLOW}Aguardando serviços inicializarem...${NC}"
    sleep 10
    
    echo -e "${GREEN}Infraestrutura iniciada!${NC}"
    echo -e "${YELLOW}Frontend disponível em:${NC} http://localhost:5173"
    echo -e "${YELLOW}API Gateway disponível em:${NC} http://localhost:3001"
    
    # Verificar se todos os serviços estão rodando
    if docker-compose ps | grep -q "Exit"; then
        echo -e "${RED}Alguns serviços não iniciaram corretamente.${NC}"
        docker-compose ps
    else
        echo -e "${GREEN}Todos os serviços estão rodando!${NC}"
    fi
    
    read -p "Pressione Enter para continuar..."
}

# Função para verificar status dos serviços
check_status() {
    echo -e "${GREEN}Verificando status dos serviços...${NC}"
    docker-compose ps
    
    read -p "Pressione Enter para continuar..."
}

# Função para parar todos os serviços
stop_all() {
    echo -e "${YELLOW}Parando todos os serviços...${NC}"
    docker-compose down
    echo -e "${GREEN}Todos os serviços foram parados.${NC}"
    
    read -p "Pressione Enter para continuar..."
}

# Função para ver logs
view_logs() {
    echo -e "${BLUE}Escolha um serviço para ver os logs:${NC}"
    echo "1. central-tracking-service"
    echo "2. eta-service"
    echo "3. express-grpc-gateway"
    echo "4. frontend"
    echo "5. Voltar"
    
    read -p "Escolha uma opção: " log_option
    
    case $log_option in
        1) docker-compose logs -f central-tracking-service ;;
        2) docker-compose logs -f eta-service ;;
        3) docker-compose logs -f express-grpc-gateway ;;
        4) docker-compose logs -f frontend ;;
        5) return ;;
        *) echo -e "${RED}Opção inválida${NC}" && sleep 2 ;;
    esac
}

# Função para iniciar um veículo
start_vehicle() {
    echo -e "${BLUE}=== INICIAR VEÍCULO ===${NC}"
    echo "Escolha um arquivo GPX:"
    
    # Diretório dos arquivos GPX
    GPX_DIR="vehicle-grpc-client/GPX"
    
    # Listar arquivos GPX disponíveis
    GPX_FILES=($(ls ${GPX_DIR}/*.gpx 2>/dev/null))
    
    if [ ${#GPX_FILES[@]} -eq 0 ]; then
        echo -e "${RED}Nenhum arquivo GPX encontrado em ${GPX_DIR}/${NC}"
        read -p "Pressione Enter para continuar..."
        return
    fi
    
    for i in "${!GPX_FILES[@]}"; do
        echo "$((i+1)). $(basename ${GPX_FILES[$i]})"
    done
    
    read -p "Escolha o número do arquivo GPX: " gpx_number
    
    if ! [[ "$gpx_number" =~ ^[0-9]+$ ]] || [ $gpx_number -lt 1 ] || [ $gpx_number -gt ${#GPX_FILES[@]} ]; then
        echo -e "${RED}Opção inválida${NC}"
        read -p "Pressione Enter para continuar..."
        return
    fi
    
    GPX_FILE="GPX/$(basename ${GPX_FILES[$gpx_number-1]})"
    
    # Solicitar ID do veículo
    read -p "Digite o ID do veículo (ex: carro-01): " vehicle_id
    
    # Solicitar velocidade
    read -p "Digite a velocidade em km/h (padrão: 50): " vehicle_speed
    vehicle_speed=${vehicle_speed:-50}
    
    # Gerar um nome para o contêiner
    container_name="vehicle-${vehicle_id}-$(date +%s)"
    
    echo -e "${GREEN}Iniciando veículo ${vehicle_id}...${NC}"
    
    # Verificar o nome da rede
    NETWORK_NAME=$(docker-compose config --services | grep vehicle-client >/dev/null && docker network ls --filter name=_tracking_network --format "{{.Name}}" | head -n1)
    
    if [ -z "$NETWORK_NAME" ]; then
        echo -e "${RED}Rede de tracking não encontrada. Verifique se a infraestrutura está rodando.${NC}"
        read -p "Pressione Enter para continuar..."
        return
    fi
    
    # Iniciar o contêiner de veículo
    docker run -d \
        --name $container_name \
        --network $NETWORK_NAME \
        -v $(pwd)/protos:/app/protos \
        -v $(pwd)/${GPX_DIR}:/app/GPX \
        --env TRACKING_SERVICE_HOST=central-tracking-service \
        --env TRACKING_SERVICE_PORT=50051 \
        $(docker-compose config --services | grep vehicle-client >/dev/null && docker-compose images -q vehicle-client) \
        node dist/client.js --file "$GPX_FILE" --id "$vehicle_id" --server "central-tracking-service:50051" --vel $vehicle_speed
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Veículo iniciado! ID do contêiner: ${container_name}${NC}"
    else
        echo -e "${RED}Erro ao iniciar o veículo. Verifique os logs para mais detalhes.${NC}"
    fi
    
    read -p "Pressione Enter para continuar..."
}

# Função para verificar veículos em execução
check_vehicles() {
    echo -e "${BLUE}=== VEÍCULOS EM EXECUÇÃO ===${NC}"
    docker ps --filter "name=vehicle-" --format "table {{.Names}}\t{{.Status}}\t{{.Command}}"
    
    read -p "Pressione Enter para continuar..."
}

# Função para parar um veículo específico
stop_vehicle() {
    echo -e "${BLUE}=== PARAR UM VEÍCULO ===${NC}"
    # Obter lista de contêineres de veículos em execução
    VEHICLES=($(docker ps --filter "name=vehicle-" --format "{{.Names}}" | grep -v "vehicle-client"))
    
    if [ ${#VEHICLES[@]} -eq 0 ]; then
        echo -e "${RED}Nenhum veículo em execução.${NC}"
        read -p "Pressione Enter para continuar..."
        return
    fi
    
    echo "Veículos em execução:"
    for i in "${!VEHICLES[@]}"; do
        echo "$((i+1)). ${VEHICLES[$i]}"
    done
    
    read -p "Escolha o número do veículo para parar (ou 0 para cancelar): " vehicle_number
    
    if [ "$vehicle_number" = "0" ]; then
        return
    fi
    
    if ! [[ "$vehicle_number" =~ ^[0-9]+$ ]] || [ $vehicle_number -lt 1 ] || [ $vehicle_number -gt ${#VEHICLES[@]} ]; then
        echo -e "${RED}Opção inválida${NC}"
        read -p "Pressione Enter para continuar..."
        return
    fi
    
    selected_vehicle=${VEHICLES[$vehicle_number-1]}
    
    echo -e "${YELLOW}Parando veículo ${selected_vehicle}...${NC}"
    docker stop $selected_vehicle
    docker rm $selected_vehicle
    
    echo -e "${GREEN}Veículo parado e removido.${NC}"
    read -p "Pressione Enter para continuar..."
}

# Função para iniciar o cliente ETA interativo
start_eta_client() {
    echo -e "${GREEN}Iniciando cliente ETA interativo...${NC}"
    echo -e "${YELLOW}Para sair do cliente, digite 'q' ou 'quit' no prompt do cliente.${NC}"
    echo -e "${YELLOW}Pressione Ctrl+C caso fique preso.${NC}"
    echo ""
    
    docker-compose exec -it eta-client node dist/eta-client.js
}

# Função para limpar todos os dados
clean_all() {
    echo -e "${RED}ATENÇÃO! Esta ação irá parar todos os contêineres e remover todos os dados!${NC}"
    read -p "Tem certeza que deseja continuar? (s/N): " confirm
    
    if [[ $confirm == [Ss] ]]; then
        echo -e "${YELLOW}Parando todos os serviços...${NC}"
        docker-compose down -v
        
        # Remover contêineres de veículos individuais
        VEHICLES=($(docker ps -a --filter "name=vehicle-" -q | grep -v $(docker ps -aqf "name=vehicle-client")))
        if [ ${#VEHICLES[@]} -gt 0 ]; then
            echo -e "${YELLOW}Removendo contêineres de veículos...${NC}"
            docker rm -f ${VEHICLES[@]} 2>/dev/null || true
        fi
        
        echo -e "${GREEN}Limpeza concluída. Todos os dados foram removidos.${NC}"
    else
        echo -e "${GREEN}Operação cancelada.${NC}"
    fi
    
    read -p "Pressione Enter para continuar..."
}

# Loop principal
while true; do
    show_menu
    read -p "Opção: " option
    
    case $option in
        1) start_infrastructure ;;
        2) check_status ;;
        3) stop_all ;;
        4) view_logs ;;
        5) start_vehicle ;;
        6) check_vehicles ;;
        7) stop_vehicle ;;
        8) start_eta_client ;;
        9) clean_all ;;
        10) diagnose_services ;;
        0) clear && echo -e "${GREEN}Encerrando...${NC}" && exit 0 ;;
        *) echo -e "${RED}Opção inválida${NC}" && sleep 2 ;;
    esac
done