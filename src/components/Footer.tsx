import { ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-white border-t mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-center items-center">
          <p className="text-gray-600 text-sm">
            © {new Date().getFullYear()} Ccode.VIP 版权所有
          </p>
          <a
            href="https://ccode.vip"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center ml-2 text-blue-600 hover:text-blue-800 transition-colors"
          >
            访问官网
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}