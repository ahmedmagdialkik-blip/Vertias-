import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { RouterLink } from '../lib/router';

interface PortalFrameProps {
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export const PortalFrame: React.FC<PortalFrameProps> = ({
  title,
  subtitle,
  headerRight,
  maxWidthClass = 'max-w-lg',
  children
}) => {
  return (
    <div className="min-h-screen bg-[#1A1217] text-[#EDE6D6] flex flex-col">
      <header className="border-b border-[#EDE6D6]/15 bg-[#1A1217]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3.5 min-w-0">
            <RouterLink
              to="/"
              className="flex items-center gap-3 text-[#EDE6D6] no-underline group focus-visible:outline-2 focus-visible:outline-[#4F9A57]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#4F9A57]/60 bg-[#EDE6D6] p-0.5">
                <img
                  src="/logo.png"
                  alt="Veritas MUN"
                  className="h-full w-full rounded-full object-cover"
                />
              </span>
              <span className="font-['Cinzel',serif] text-sm font-semibold tracking-[0.12em] uppercase text-[#EDE6D6] group-hover:text-[#4F9A57] transition-colors whitespace-nowrap">
                Veritas MUN
              </span>
            </RouterLink>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {headerRight}
            <RouterLink
              to="/"
              className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap font-['Cormorant_Garamond',Georgia,serif] text-base font-semibold text-[#EDE6D6]/85 hover:text-[#4F9A57] transition-colors"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Public site</span>
            </RouterLink>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 sm:px-8 sm:py-14">
        <div className={`mx-auto w-full ${maxWidthClass}`}>
          <div className="mb-8 border-l-2 border-[#4F9A57] pl-4">
            <h1 className="font-['Cinzel',serif] text-2xl sm:text-3xl font-semibold tracking-[0.04em] text-[#EDE6D6]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1.5 font-['Cormorant_Garamond',Georgia,serif] text-lg italic text-[#EDE6D6]/80">
                {subtitle}
              </p>
            ) : null}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
};
