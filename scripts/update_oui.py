#!/usr/bin/env python3
"""
Herramienta CLI para consultar y actualizar la base de datos de fabricantes OUI (MAC).
Wi-Fi Roaming Analyzer.

Uso:
  python3 update_oui.py                  # Descarga y actualiza desde el registro oficial IEEE
  python3 update_oui.py --stats          # Muestra estadísticas de la base de datos
  python3 update_oui.py --lookup <BSSID> # Consulta el fabricante de una MAC / BSSID
  python3 update_oui.py --search <texto> # Busca fabricantes por texto o prefijo
  python3 update_oui.py --add <XX:XX:XX> <Nombre> # Registra un fabricante personalizado
"""

import sys
import os
import argparse

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from core.oui_manager import oui_manager

def main():
    parser = argparse.ArgumentParser(description="Gestor de Base de Datos OUI de Fabricantes Wi-Fi / AP")
    parser.add_argument("--stats", action="store_true", help="Muestra estadísticas de la base de datos local")
    parser.add_argument("--lookup", type=str, metavar="BSSID", help="Consulta el fabricante de una MAC o BSSID")
    parser.add_argument("--search", type=str, metavar="QUERY", help="Busca fabricantes por prefijo o nombre")
    parser.add_argument("--add", nargs=2, metavar=("PREFIX", "NAME"), help="Registra o actualiza un prefijo personalizado (ej: 00:1A:1E 'Cisco Lab')")
    parser.add_argument("--force", action="store_true", help="Fuerza la descarga y actualización desde el IEEE")

    args = parser.parse_args()

    if args.stats:
        info = oui_manager.get_info()
        print("\n=== Estadísticas Base de Datos OUI ===")
        print(f"• Total de fabricantes:     {info['total']:,}")
        print(f"• Registros base/IEEE:      {info['vendors_count']:,}")
        print(f"• Registros personalizados: {info['custom_count']}")
        print(f"• Última actualización:    {info['last_updated'] or 'Nunca'}")
        print(f"• Fuente:                   {info['source']}")
        print("======================================\n")
        return

    if args.lookup:
        vendor = oui_manager.lookup(args.lookup)
        print(f"\n[Consulta] BSSID/MAC: {args.lookup} -> Fabricante: {vendor}\n")
        return

    if args.search:
        results = oui_manager.search(args.search, limit=20)
        print(f"\nResultados para '{args.search}' ({len(results)} encontrados):")
        for r in results:
            custom_tag = " [Personalizado]" if r.get('is_custom') else ""
            print(f"  • {r['prefix']} : {r['vendor']}{custom_tag}")
        print()
        return

    if args.add:
        prefix, name = args.add
        try:
            res = oui_manager.add_custom(prefix, name)
            print(f"\n[OK] Guardado fabricante personalizado: {res['prefix']} -> '{res['vendor']}'\n")
        except Exception as e:
            print(f"\n[ERROR] No se pudo guardar: {e}\n", file=sys.stderr)
            sys.exit(1)
        return

    # Acción por defecto: Actualizar desde IEEE
    print("\nIniciando actualización de fabricantes desde el registro oficial IEEE...")
    res = oui_manager.trigger_ieee_update(background=False)
    if res.get("status") == "success":
        result = res.get("result", {})
        print(f"[OK] Actualización exitosa:")
        print(f"• Total fabricantes registrados: {result.get('total', 0):,}")
        print(f"• Fecha / Hora: {result.get('timestamp')}")
        print("La base de datos fue guardada en 'oui_vendors.json'.\n")
    else:
        print(f"[ERROR] Falló la actualización: {res.get('error')}\n", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
