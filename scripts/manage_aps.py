#!/usr/bin/env python3
"""
Herramienta de línea de comandos para consultar y gestionar los nombres de APs de controladora.
Wi-Fi Roaming Analyzer.

Uso:
  python3 manage_aps.py --list                  # Lista todos los APs registrados
  python3 manage_aps.py --lookup <BSSID>        # Consulta el nombre asignado a una MAC / BSSID
  python3 manage_aps.py --search <texto>        # Busca APs por nombre, MAC o ubicación
  python3 manage_aps.py --add <MAC> <Nombre>    # Registra un AP individual
  python3 manage_aps.py --import-csv <archivo>  # Importa archivo CSV exportado de controladora
  python3 manage_aps.py --remove <MAC>          # Elimina un AP registrado
"""

import sys
import os
import argparse

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from core.ap_manager import ap_manager

def main():
    parser = argparse.ArgumentParser(description="Gestor de Nombres de APs de Controladoras Wi-Fi")
    parser.add_argument("--list", action="store_true", help="Lista los APs registrados")
    parser.add_argument("--lookup", type=str, metavar="BSSID", help="Consulta el nombre de un BSSID / MAC")
    parser.add_argument("--search", type=str, metavar="QUERY", help="Busca APs por término")
    parser.add_argument("--add", nargs=2, metavar=("MAC", "NAME"), help="Registra un AP (ej: B0:14:DF:11:22:33 'AP-Piso2')")
    parser.add_argument("--location", type=str, default="", help="Ubicación opcional para --add")
    parser.add_argument("--model", type=str, default="", help="Modelo de AP opcional para --add")
    parser.add_argument("--import-csv", type=str, metavar="FILE", help="Ruta a un archivo CSV para importar")
    parser.add_argument("--remove", type=str, metavar="MAC", help="Elimina un AP registrado")

    args = parser.parse_args()

    if args.lookup:
        details = ap_manager.lookup_details(args.lookup)
        if details:
            print(f"\n[AP Encontrado]")
            print(f"• MAC / BSSID:  {args.lookup}")
            print(f"• Nombre AP:    {details.get('name')}")
            if details.get('location'):
                print(f"• Ubicación:    {details.get('location')}")
            if details.get('model'):
                print(f"• Modelo:       {details.get('model')}")
            print(f"• Tipo enlace:  {details.get('match')}\n")
        else:
            print(f"\nNo se encontró un nombre asignado para el BSSID: {args.lookup}\n")
        return

    if args.add:
        mac, name = args.add
        try:
            res = ap_manager.add_or_update(mac, name, location=args.location, model=args.model)
            print(f"\n[OK] AP registrado: {res['mac']} -> '{res['name']}'\n")
        except Exception as e:
            print(f"\n[ERROR] {e}\n", file=sys.stderr)
            sys.exit(1)
        return

    if args.remove:
        if ap_manager.remove(args.remove):
            print(f"\n[OK] AP con MAC '{args.remove}' eliminado.\n")
        else:
            print(f"\n[AVISO] No se encontró el AP con MAC '{args.remove}'.\n")
        return

    if args.import_csv:
        path = args.import_csv
        if not os.path.exists(path):
            print(f"\n[ERROR] Archivo no encontrado: {path}\n", file=sys.stderr)
            sys.exit(1)
        try:
            # Leer manejando encodings de Windows y Linux
            content = None
            for enc in ('utf-8', 'utf-8-sig', 'cp1252', 'latin1'):
                try:
                    with open(path, 'r', encoding=enc) as f:
                        content = f.read()
                        break
                except UnicodeDecodeError:
                    continue
            if content is None:
                raise Exception("No fue posible decodificar el archivo CSV con encodings estándar.")

            res = ap_manager.import_csv(content)
            print(f"\n[OK] Importación completada:")
            print(f"• Nuevos APs agregados:    {res['added']}")
            print(f"• APs existentes editados: {res['updated']}")
            print(f"• Total APs en la base:    {res['total']}")
            if res.get("errors"):
                print(f"• Errores encontrados ({len(res['errors'])}):")
                for err in res["errors"]:
                    print(f"    - {err}")
            print()
        except Exception as e:
            print(f"\n[ERROR] Error al importar CSV: {e}\n", file=sys.stderr)
            sys.exit(1)
        return

    if args.search or args.list:
        query = args.search or ""
        results = ap_manager.search(query, limit=100)
        info = ap_manager.get_info()
        print(f"\n=== APs Registrados (Total: {info['total']}) ===")
        if not results:
            print("No se encontraron APs registrados.")
        else:
            for ap in results:
                loc_str = f" | Ubicación: {ap['location']}" if ap.get('location') else ""
                mod_str = f" | Modelo: {ap['model']}" if ap.get('model') else ""
                print(f"  • {ap['mac']}  ->  {ap['name']}{loc_str}{mod_str}")
        print("==============================================\n")
        return

    # Si no hay argumentos, mostrar info
    info = ap_manager.get_info()
    print(f"\n=== Base de APs de Controladora ===")
    print(f"• Total APs cargados:    {info['total']}")
    print(f"• Última actualización:  {info['last_updated'] or 'Sin datos'}")
    print(f"• Archivo:               ap_names.json")
    print(f"Usa --help para ver las opciones disponibles.\n")

if __name__ == "__main__":
    main()
