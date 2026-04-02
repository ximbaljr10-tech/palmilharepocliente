import csv
import datetime
import os

DOMAIN = "https://www.dentedetubarao.com.br"
SITEMAP_PATH = "/home/root/webapp/public/sitemap.xml"
CSV_PATH = "/home/root/webapp/products.csv"

# Static routes with priority and changefreq
STATIC_ROUTES = [
    ("/store", "1.0", "daily"),
    ("/store/sobre", "0.6", "monthly"),
    ("/store/contato", "0.6", "monthly"),
    ("/store/blog", "0.7", "weekly"),
    ("/store/politica-privacidade", "0.3", "monthly"),
    ("/store/termos-uso", "0.3", "monthly"),
    ("/store/trocas-devolucoes", "0.5", "monthly"),
    ("/store/frete-entrega", "0.5", "monthly"),
]

# Blog posts
BLOG_SLUGS = [
    ("como-escolher-linha-pipa", "0.6", "monthly"),
    ("seguranca-pipa-locais", "0.6", "monthly"),
    ("historia-das-pipas", "0.6", "monthly"),
]

def generate_sitemap():
    urls = []
    today = datetime.date.today().isoformat()

    # Add static routes
    for route, priority, changefreq in STATIC_ROUTES:
        urls.append((f"{DOMAIN}{route}", priority, changefreq))

    # Add blog posts
    for slug, priority, changefreq in BLOG_SLUGS:
        urls.append((f"{DOMAIN}/store/blog/{slug}", priority, changefreq))

    # Add product routes from CSV
    if os.path.exists(CSV_PATH):
        try:
            with open(CSV_PATH, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    handle = row.get('URL handle')
                    if handle:
                        urls.append((f"{DOMAIN}/store/product/{handle}", "0.7", "weekly"))
        except Exception as e:
            print(f"Error reading CSV: {e}")
    
    # Generate XML
    xml_content = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml_content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

    for url, priority, changefreq in urls:
        xml_content += '  <url>\n'
        xml_content += f'    <loc>{url}</loc>\n'
        xml_content += f'    <lastmod>{today}</lastmod>\n'
        xml_content += f'    <changefreq>{changefreq}</changefreq>\n'
        xml_content += f'    <priority>{priority}</priority>\n'
        xml_content += '  </url>\n'

    xml_content += '</urlset>'

    with open(SITEMAP_PATH, 'w', encoding='utf-8') as f:
        f.write(xml_content)
    
    print(f"Sitemap generated at {SITEMAP_PATH} with {len(urls)} URLs")

if __name__ == "__main__":
    generate_sitemap()
