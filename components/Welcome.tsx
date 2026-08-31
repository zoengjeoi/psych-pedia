import React from 'react';

interface WelcomeProps {
  onGetStarted: () => void;
}

const Welcome: React.FC<WelcomeProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4 animate-fade-in">
      <div className="max-w-3xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white tracking-tight animate-fade-in-up">
            欢迎来到 <span className="text-gradient">PsychPedia</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 font-medium animate-fade-in-up" style={{ animationDelay: '.1s' }}>
            精神药理学知识库 · 为临床医生打造
          </p>
        </div>

        {/* Features Grid */}
        <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card-depth bg-white dark:bg-medical-surface rounded-lg p-6 border border-slate-200 dark:border-medical-line hover:-translate-y-0.5 hover:border-cyan-400 dark:hover:border-cyan-400 transition-all">
            <svg className="w-8 h-8 text-cyan-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            <h3 className="font-serif font-bold text-slate-900 dark:text-white mb-2">受体图谱</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">基于Stahl paradigm的交互式雷达图</p>
          </div>
          <div className="card-depth bg-white dark:bg-medical-surface rounded-lg p-6 border border-slate-200 dark:border-medical-line hover:-translate-y-0.5 hover:border-amber-400 dark:hover:border-amber-400 transition-all">
            <svg className="w-8 h-8 text-amber-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
            <h3 className="font-serif font-bold text-slate-900 dark:text-white mb-2">药代参数</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">半衰期、蛋白结合率、代谢途径</p>
          </div>
          <div className="card-depth bg-white dark:bg-medical-surface rounded-lg p-6 border border-slate-200 dark:border-medical-line hover:-translate-y-0.5 hover:border-teal-400 dark:hover:border-teal-400 transition-all">
            <svg className="w-8 h-8 text-teal-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m7 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <h3 className="font-serif font-bold text-slate-900 dark:text-white mb-2">临床实战</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">精选的临床笔记和诊疗建议</p>
          </div>
          <div className="card-depth bg-white dark:bg-medical-surface rounded-lg p-6 border border-slate-200 dark:border-medical-line hover:-translate-y-0.5 hover:border-violet-400 dark:hover:border-violet-400 transition-all">
            <svg className="w-8 h-8 text-violet-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C6.248 6.253 2 10.541 2 15.5S6.248 24.747 12 24.747s10-4.288 10-9.247S17.752 6.253 12 6.253z"></path></svg>
            <h3 className="font-serif font-bold text-slate-900 dark:text-white mb-2">原理解析</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">神经药理学基础知识库</p>
          </div>
        </div>

        {/* Quick Start */}
        <div className="bg-white dark:bg-medical-surface rounded-lg p-8 border border-slate-200 dark:border-slate-700 space-y-4">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white">快速开始</h3>
          <ol className="space-y-3 text-slate-700 dark:text-slate-300">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-cyan-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
              <span>从左侧菜单选择一款精神药物</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-cyan-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
              <span>点击受体图谱中的原理标签，深入学习神经药理学基础</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-cyan-500 text-white rounded-full flex items-center justify-center text-sm font-bold">3</span>
              <span>查看临床笔记和市场信息，制定个体化治疗方案</span>
            </li>
          </ol>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <button
            onClick={onGetStarted}
            className="px-8 py-3 bg-gradient-to-r from-medical-primary to-medical-primaryDeep hover:from-medical-primaryDeep hover:to-medical-primary text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 hover:shadow-cyan-500/25"
          >
            开始探索 →
          </button>
        </div>
      </div>
    </div>
  );
};

export default Welcome;
