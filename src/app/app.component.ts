import { Component, OnDestroy, OnInit } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ScrapService } from './services/scrap.service';
import { Subscription } from 'rxjs';
import { Node } from './model/interfaces/node.interface';
import { Matchday } from './model/interfaces/matchday.interface';
import * as moment from 'moment';
import { Match } from './model/interfaces/match.interface';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'footballtv';
  isProd = environment.production;

  deviceType?: 'MOBILE' | 'TABLET' | 'DESKTOP';

  scrapApiUrl = environment.scrapApi;

  scrappingData = true;
  scrappedData?: unknown;
  scrappedDataSubscription?: Subscription;
  scrappedDataRootNode?: Node;
  scrappedDataNodeList?: (string | Node)[];

  error?: unknown;

  matchDaysAll: Matchday[] = [];
  matchDaysFiltered: Matchday[] = [];

  filterData: {
    dates: string[],
    competitions: string[],
    teams: string[],
    tvs: string[]
  } = {
    dates: [],
    competitions: [],
    teams: [],
    tvs: []
  };

  constructor(
    private readonly scrapService: ScrapService
  ){}

  loadScrappedData() {
    this.scrappingData = true;
    this.scrappedDataSubscription = this.scrapService.scrapUrl('futbolenlatele.com').subscribe({
      next: (_scrappedData) => {
        this.error = undefined;
        this.scrappedData=_scrappedData;

        const scrappedDataHtml: {html: Node} = (this.scrappedData as {html: Node});
        this.scrappedDataRootNode = scrappedDataHtml.html;
        this.scrappedDataNodeList = this.findNodesWithClassAttr(this.scrappedDataRootNode, 'col-md-8 col-sm-6 partidos') || undefined;

        if (this.scrappedDataNodeList?.length>0) {
          this.scrappedDataNodeList = (this.scrappedDataNodeList[0] as Node).children;
          if (this.scrappedDataNodeList && this.scrappedDataNodeList.length>0) {
            this.buildMatchayList();
            this.fillFilterData();
            this.doFilterData();
          }
        }
      },
      error:(_error) => {
        this.error = _error;
        this.scrappingData=false;
        this.scrappedData=undefined;
      },
      complete:() => this.scrappingData=false
    });
  }

  filter: {
    selectedDate: Date | null,
    selectedCompetition: string | null,
    selectedTeam: string | null,
    selectedTv: string | null
  } = {
    selectedDate: null,
    selectedCompetition: null,
    selectedTeam: null,
    selectedTv: null
  };

  matchMatchesFilter(match: Match): boolean {
    if (!this.isFilteredByDate() && !this.isFilteredByCompetition() && !this.isFilteredByTeam() && !this.isFilteredByTv()) {
      return true;
    } else if (this.isFilteredByCompetition() && this.filter.selectedCompetition===match.competition) {
      return true;
    } else if (this.isFilteredByTeam() && (this.filter.selectedTeam===match.homeTeam || this.filter.selectedTeam===match.awayTeam)) {
      return true;
    } else if (this.isFilteredByTv() && this.filter.selectedTv && match.tv.includes(this.filter.selectedTv)) {
      return true;
    }
    return this.isFilteredByDate() && moment(match.date).format('YYYY-MM-DD')===moment(this.filter.selectedDate).format('YYYY-MM-DD');
  }  

  private matchDayMatchesFilter(matchDay: Matchday): boolean {  
    if (this.isFilteredByDate()) { // If date filter exists
      // If matchday date matches
      if (moment(matchDay.date).format('YYYY-MM-DD')===moment(this.filter.selectedDate).format('YYYY-MM-DD')) {
        return true;
      }
      // If matchday date don't matches but any match matches
      return matchDay.matches.some((_match) => {
        return this.matchMatchesFilter(_match);
      });
    } else { // If date filter don't exists
      if(!this.isFilteredByDate() && !this.isFilteredByCompetition && !this.isFilteredByTeam() && !this.isFilteredByTv()){
        return true;
      }
      // If matchday date don't matches but any match matches
      return matchDay.matches.some((_match) => {
        return this.matchMatchesFilter(_match);
      });
    }
  }

  private isFilteredByDate(): boolean {
    return this.filter.selectedDate!==undefined && this.filter.selectedDate!=null;
  }
  private isFilteredByCompetition(): boolean {
    return this.filter.selectedCompetition!==undefined && this.filter.selectedCompetition!=null;
  }
  private isFilteredByTeam(): boolean {
    return this.filter.selectedTeam!==undefined && this.filter.selectedTeam!=null;
  }
  private isFilteredByTv(): boolean {
    return this.filter.selectedTv!==undefined && this.filter.selectedTv!=null;
  }

  doFilterData() {
    setTimeout(() => {
      const matchdaysCopy: Matchday[] = JSON.parse(JSON.stringify(this.matchDaysAll)) as Matchday[];
      this.matchDaysFiltered  = matchdaysCopy.filter((_matchday) => {
        return this.matchDayMatchesFilter(_matchday);
      }).map((_matchDay) => {
        _matchDay.matches = _matchDay.matches.filter((_match) => this.matchMatchesFilter(_match));
        return _matchDay;
      });
    }, 100);
  }

  private buildMatchayList() {
    this.matchDaysAll = [];
    if (this.scrappedDataNodeList) {
      (this.scrappedDataNodeList as Node[]).forEach((_node) => {
        switch(_node.tag) {
          case 'a':
            if (_node.attrs && _node.attrs['href']) {
              const dateStr = _node.attrs['href'].substring(_node.attrs['href'].indexOf('=')+1);
              this.matchDaysAll.push({
                date: moment(dateStr, 'YYYY-MM-DD').toDate(),
                matches: []
              });
            }
            break;
          case 'div':
            if (_node.attrs && _node.attrs['class'] && _node.attrs['class'].indexOf('div_partido')===0) {
              this.matchDaysAll[this.matchDaysAll.length-1].matches.push(this.getMatch(_node, this.matchDaysAll[this.matchDaysAll.length-1].date));
            }
            break;
        }
      });
    }
  }

  private fillFilterData() {
    this.filterData = {
      dates: [],
      competitions: [],
      teams: [],
      tvs: []
    };

    this.matchDaysAll.forEach((_matchDay) => {
      this.filterData.dates.push(moment(_matchDay.date).format(''));
      if (_matchDay.matches) {
        _matchDay.matches.forEach((_match) => {
          if (!this.filterData.competitions.some((_competition) => _competition===_match.competition)) {
            this.filterData.competitions.push(_match.competition);
          }
          if (!this.filterData.teams.some((_team) => _team===_match.homeTeam)) {
            this.filterData.teams.push(_match.homeTeam);
          }
          if (!this.filterData.teams.some((_team) => _team===_match.awayTeam)) {
            this.filterData.teams.push(_match.awayTeam);
          }
          if (_match.tv.length>0) {
            _match.tv.forEach((_tv) => {
              if (!this.filterData.tvs.some((__tv) => __tv===_tv)) {
                this.filterData.tvs.push(_tv);
              }
            });
          }
        });
      }
    });

    this.filterData.competitions.sort();
    this.filterData.teams.sort();
    this.filterData.tvs.sort();
  }

  private getMatch(node: Node, date: Date): Match {
    return {
      date: this.getMatchDate(node, date),
      competition: this.getCompetition(node),
      flag: this.getFlag(node),
      tv: this.getTv(node),
      homeTeam: this.getHomeTeam(node),
      awayTeam: this.getAwayTeam(node),
      calendarUrl: this.getCalendarUrl(node)
    };
  }
  private getMatchDate(node: Node, date: Date): Date {
    const horaStr = (this.findNodesWithClassAttr(node, 'div_hora')[0].children as string[])[0];
    const dateStr = moment(date).format('YYYY-MM-DD');
    return moment(`${dateStr} ${horaStr}`, 'YYYY-MM-DD HH:mm:ss').toDate();
  }
  private getCompetition(node: Node): string {
    if (this.findNodesWithClassAttr(node, 'div_campeonato').length>0) {
      const _node: Node = this.findNodesWithClassAttr(node, 'div_campeonato')[0];
      if (_node.children && _node.children.length>0 && (_node.children[1] as Node).children) {
        return (((_node.children[1] as Node).children) as string[])[0];
      }
    }
    return '';
  }
  private getFlag(node: Node): string {
    if (this.findNodesWithClassAttr(node, 'div_campeonato').length>0) {
      const _node: Node = this.findNodesWithClassAttr(node, 'div_campeonato')[0];
      if (_node.children) {
        return (((_node.children[0] as Node).attrs) as {src: string}).src;
      }
    }
    return '';
  }
  private getTv(node: Node): string[] {
    if (this.findNodesWithClassAttr(node, 'div_cadena nomovil2').length>0) {
      const _node: Node = this.findNodesWithClassAttr(node, 'div_cadena nomovil2')[0];
      if (_node.children && _node.children.length>0 && (_node.children[0] as Node).children) {
        return ((((_node.children[0] as Node).children) as string[])[0]).split(/\s*\/\s*/)
      }
    }
    return [];
  }
  private getHomeTeam(node: Node): string {
    if (this.findNodesWithClassAttr(node, 'div_equipo1').length>0) {
      const _node: Node = this.findNodesWithClassAttr(node, 'div_equipo1')[0];
      if (_node.children && _node.children.length>0 && (_node.children[0] as Node).children) {
        return ((((_node.children[0] as Node).children) as string[])[0]);
      }
    }
    return '';
  }
  private getAwayTeam(node: Node): string {
    if (this.findNodesWithClassAttr(node, 'div_equipo2').length>0) {
      const _node: Node = this.findNodesWithClassAttr(node, 'div_equipo2')[0];
      if (_node.children && _node.children.length>0 && (_node.children[0] as Node).children) {
        return ((((_node.children[0] as Node).children) as string[])[0]);
      }
    }
    return '';
  }
  private getCalendarUrl(node: Node):string {
    if (this.findNodesWithClassAttr(node, 'div_cadena nomovil2').length>0) {
      const _node: Node = this.findNodesWithClassAttr(node, 'div_cadena nomovil2')[0];
      if (_node.children && _node.children.length>0 && (_node.children[0] as Node).children) {
        const nodeChildren: (string | Node)[] | undefined = (_node.children[0] as Node).children;
        if (nodeChildren) {
          const nodeChildrenCalendarUrl: Node = nodeChildren[1] as Node;
          if (nodeChildrenCalendarUrl && nodeChildrenCalendarUrl.attrs && nodeChildrenCalendarUrl.attrs['href']) {
            return nodeChildrenCalendarUrl.attrs['href'];
          }
        }
      }
    }
    return '';
  }

  private findNodesWithClassAttr(node: Node, classValue: string, results: Node[] = []): Node[] {
    if (node.attrs && node.attrs['class'] && (node.attrs['class']===classValue)) {
      results.push(node);
    }
  
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (typeof child === 'object') {
          this.findNodesWithClassAttr(child, classValue, results);
        }
      }
    }
    return results;
  }

  private checkDeviceType() {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) {
      this.deviceType = 'MOBILE';
    } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
      this.deviceType = 'TABLET';
    } else {
      this.deviceType = 'DESKTOP';
    }
    console.log(this.deviceType);
  }
  
  ngOnInit(): void {
    this.loadScrappedData();
    this.checkDeviceType();    
  }

  ngOnDestroy(): void {
    if (this.scrappedDataSubscription) {
      this.scrappedDataSubscription.unsubscribe();
    }
  }
}
