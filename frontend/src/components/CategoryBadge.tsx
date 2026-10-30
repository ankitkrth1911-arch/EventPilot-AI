import React from 'react';
import { EventCategory, CATEGORY_THEMES } from '../types/event';
import { Heart, Users, Sparkles } from 'lucide-react';

interface CategoryBadgeProps {
  category: EventCategory;
  showIcon?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  category,
  showIcon = true,
  className = '',
  size = 'md',
}) => {
  const theme = CATEGORY_THEMES[category] || CATEGORY_THEMES.wedding;

  const iconMap: Record<EventCategory, React.ReactNode> = {
    wedding: <Heart className="w-3.5 h-3.5 stroke-[2.5]" />,
    community: <Users className="w-3.5 h-3.5 stroke-[2.5]" />,
    birthday: <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />,
  };

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-0.5 h-6 gap-1 font-semibold',
    md: 'text-xs px-3 py-1 h-[28px] gap-1.5 font-semibold tracking-wide',
    lg: 'text-sm px-3.5 py-1.5 h-[32px] gap-2 font-bold tracking-wide',
  };

  const styleMap: Record<EventCategory, { color: string; backgroundColor: string; borderColor: string }> = {
    wedding: {
      color: '#4B2FC9',
      backgroundColor: '#EDE9FE',
      borderColor: '#DDD6FE',
    },
    community: {
      color: '#0D9488',
      backgroundColor: '#CCFBF1',
      borderColor: '#99F6E4',
    },
    birthday: {
      color: '#D97706',
      backgroundColor: '#FEF3C7',
      borderColor: '#FDE68A',
    },
  };

  const activeStyle = styleMap[category] || styleMap.wedding;

  return (
    <span
      className={`inline-flex items-center rounded-full border transition-all duration-150 select-none ${sizeClasses[size]} ${className}`}
      style={{
        color: activeStyle.color,
        backgroundColor: activeStyle.backgroundColor,
        borderColor: activeStyle.borderColor,
      }}
    >
      {showIcon && iconMap[category]}
      <span>{theme.label}</span>
    </span>
  );
};
