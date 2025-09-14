import json

# Nome do arquivo de entrada e saída
arquivo_json_entrada = 'emoji.json'
arquivo_pascal_saida = 'CodigoDelphiGerado.pas'

print(f"Lendo emojis de '{arquivo_json_entrada}'...")

# Abre o arquivo de saída para escrita com codificação UTF-8
with open(arquivo_pascal_saida, 'w', encoding='utf-8') as saida:
    # Abre o arquivo JSON de entrada
    with open(arquivo_json_entrada, 'r', encoding='utf-8') as entrada:
        # Carrega todos os dados do JSON
        lista_emojis = json.load(entrada)

        # Itera sobre cada emoji na lista
        for emoji_info in lista_emojis:
            # Pega o caractere do emoji
            emoji_char = emoji_info.get('emoji')
            
            # Pega o primeiro alias (shortcode), que é o mais comum
            aliases = emoji_info.get('aliases')
            
            # Pula se não houver emoji ou alias
            if not emoji_char or not aliases:
                continue

            # Usa o primeiro alias como base para o código
            shortcode = aliases[0]
            codigo_parametro = f":{shortcode}:"

            # Escreve as duas linhas de código Delphi no arquivo de saída
            linha1 = f"  FDictEmojiParaCodigo.Add('{emoji_char}', '{codigo_parametro}');\n"
            linha2 = f"  FDictCodigoParaEmoji.Add('{codigo_parametro}', '{emoji_char}');\n"
            
            saida.write(linha1)
            saida.write(linha2)

print(f"Sucesso! O código Delphi foi gerado em '{arquivo_pascal_saida}'.")
