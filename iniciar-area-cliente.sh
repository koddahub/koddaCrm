#!/bin/bash
echo "═══════════════════════════════════════════"
echo "  🚀 ÁREA DO CLIENTE"
echo "═══════════════════════════════════════════"
echo ""
echo "📁 Projeto: Área do Cliente"
echo "🌐 Porta: 5505"
echo "🔗 URL: http://localhost:5505"
echo ""
echo "⏳ Iniciando servidor..."
echo ""

# Verifica se é projeto PHP (precisa de PHP server)
if [ -f "index.php" ] || [ -d "apps" ]; then
    echo "📌 Projeto PHP detectado!"
    echo "👉 Use: php -S localhost:5505"
    php -S localhost:5505
else
    # Projeto web estático
    xdg-open "http://localhost:5505" 2>/dev/null || \
    open "http://localhost:5505" 2>/dev/null
    npx live-server --port=5505 --no-browser
fi
