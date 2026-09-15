export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm sm:flex-row">
        <span>
          iZyane Marketplace — retail and marketplace offers in one catalog.
        </span>
        <span>
          &copy; {new Date().getFullYear()} iZyane. All rights reserved.
        </span>
      </div>
    </footer>
  );
}
